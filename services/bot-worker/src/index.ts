import { Worker } from "bullmq";
import axios from "axios";
import { processMessage } from "@repo/bot-core";
import type { NormalizedMessage } from "@repo/types";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const CONCURRENCY = parseInt(process.env.MESSAGE_QUEUE_CONCURRENCY || "5", 10);
const WHATSAPP_API_URL = process.env.WHATSAPP_API_URL || "https://graph.facebook.com/v19.0";
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || "";
const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN || "";
const INSTAGRAM_API_URL = process.env.INSTAGRAM_API_URL || "https://graph.facebook.com/v19.0";
const INSTAGRAM_PAGE_ACCESS_TOKEN = process.env.INSTAGRAM_PAGE_ACCESS_TOKEN || "";
const GATEWAY_URL = process.env.GATEWAY_URL || "http://localhost:3001";

const redisConnection = {
  host: new URL(REDIS_URL).hostname,
  port: parseInt(new URL(REDIS_URL).port || "6379", 10),
};

async function sendWhatsAppResponse(phone: string, text: string): Promise<void> {
  if (!WHATSAPP_ACCESS_TOKEN || !WHATSAPP_PHONE_NUMBER_ID) {
    console.log(`[WhatsApp] Would send to ${phone}: ${text.slice(0, 100)}...`);
    return;
  }

  // Split long messages (WhatsApp max 4096 chars)
  const chunks = [];
  for (let i = 0; i < text.length; i += 4000) {
    chunks.push(text.slice(i, i + 4000));
  }

  for (const chunk of chunks) {
    await axios.post(
      `${WHATSAPP_API_URL}/${WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: phone,
        type: "text",
        text: { body: chunk, preview_url: false },
      },
      {
        headers: {
          Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );
  }
}

async function sendInstagramResponse(igUserId: string, text: string): Promise<void> {
  if (!INSTAGRAM_PAGE_ACCESS_TOKEN) {
    console.log(`[Instagram] Would send to ${igUserId}: ${text.slice(0, 100)}...`);
    return;
  }

  // Instagram DM max 1000 chars
  const message = text.length > 1000 ? text.slice(0, 997) + "..." : text;

  await axios.post(
    `${INSTAGRAM_API_URL}/me/messages`,
    {
      recipient: { id: igUserId },
      message: { text: message },
    },
    {
      params: { access_token: INSTAGRAM_PAGE_ACCESS_TOKEN },
    }
  );
}

async function sendWebResponse(socketId: string, text: string): Promise<void> {
  try {
    await axios.post(`${GATEWAY_URL}/internal/send`, {
      socketId,
      data: { type: "BOT_RESPONSE", text },
    });
  } catch {
    // WebSocket client may have disconnected
    console.log(`[WS] Client ${socketId} not available`);
  }
}

// ─── Worker ────────────────────────────────────────────────────────────────────
const worker = new Worker<NormalizedMessage>(
  "messages",
  async (job) => {
    const msg = job.data;
    console.log(`[Worker] Processing ${msg.channel} message from ${msg.externalId} (job: ${job.id})`);

    try {
      const result = await processMessage(
        msg.externalId,
        msg.channel as "WHATSAPP" | "INSTAGRAM" | "WEB" | "EMAIL",
        msg.text,
        msg.mediaUrl
      );

      console.log(
        `[Worker] Bot responded (${result.model}, ${result.latencyMs}ms, tools: ${result.toolsUsed.join(", ") || "none"})`
      );

      // Send response to correct channel
      switch (msg.channel) {
        case "WHATSAPP":
          await sendWhatsAppResponse(msg.externalId, result.text);
          break;
        case "INSTAGRAM":
          await sendInstagramResponse(msg.externalId, result.text);
          break;
        case "WEB":
          await sendWebResponse(msg.externalId, result.text);
          break;
        default:
          console.warn(`[Worker] Unknown channel: ${msg.channel}`);
      }

      return {
        sessionId: result.sessionId,
        model: result.model,
        latencyMs: result.latencyMs,
        toolsUsed: result.toolsUsed,
      };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : "Unknown error";
      console.error(`[Worker] Error processing message:`, errMsg);

      // Send error message to user
      const errorText = "Lo siento, tuve un problema técnico. Por favor intenta de nuevo en unos momentos. Si el problema persiste, escríbenos al correo soporte@depaseoenfincas.co 🙏";

      try {
        switch (msg.channel) {
          case "WHATSAPP":
            await sendWhatsAppResponse(msg.externalId, errorText);
            break;
          case "INSTAGRAM":
            await sendInstagramResponse(msg.externalId, errorText);
            break;
          case "WEB":
            await sendWebResponse(msg.externalId, errorText);
            break;
        }
      } catch {
        // Ignore send error
      }

      throw error; // Let BullMQ handle retries
    }
  },
  {
    connection: redisConnection,
    concurrency: CONCURRENCY,
    limiter: {
      max: parseInt(process.env.MESSAGE_QUEUE_RATE_PER_SECOND || "10", 10),
      duration: 1000,
    },
  }
);

worker.on("completed", (job, result) => {
  console.log(`✅ Job ${job.id} completed in ${(result as { latencyMs: number }).latencyMs}ms`);
});

worker.on("failed", (job, err) => {
  console.error(`❌ Job ${job?.id} failed: ${err.message}`);
});

worker.on("error", (err) => {
  console.error("[Worker] Worker error:", err);
});

process.on("SIGTERM", async () => {
  console.log("SIGTERM received, shutting down worker...");
  await worker.close();
  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log("SIGINT received, shutting down worker...");
  await worker.close();
  process.exit(0);
});

console.log(`🤖 Bot worker started (concurrency: ${CONCURRENCY})`);
