import Fastify, { type FastifyRequest, type FastifyReply } from "fastify";
import fastifyWebsocket from "@fastify/websocket";
import { Queue } from "bullmq";
import { createHmac } from "crypto";
import { normalizeWhatsApp, normalizeInstagram } from "./normalize.js";
import type { NormalizedMessage } from "@repo/types";

const PORT = parseInt(process.env.GATEWAY_PORT || "3001", 10);
const WHATSAPP_VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || "depaseo_verify";
const WHATSAPP_APP_SECRET = process.env.WHATSAPP_APP_SECRET || "";
const INSTAGRAM_APP_SECRET = process.env.INSTAGRAM_APP_SECRET || "";
const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

// BullMQ queue
const redisUrl = new URL(REDIS_URL);
const messageQueue = new Queue("messages", {
  connection: {
    host: redisUrl.hostname,
    port: parseInt(redisUrl.port || "6379", 10),
  },
  defaultJobOptions: {
    attempts: parseInt(process.env.MESSAGE_QUEUE_MAX_RETRIES || "3", 10),
    backoff: { type: "exponential", delay: 2000 },
    removeOnComplete: 1000,
    removeOnFail: 500,
  },
});

// Active WebSocket clients: socketId → raw ws
const webClients = new Map<string, { send: (data: string) => void; readyState: number }>();

function verifyMetaSignature(payload: string, signature: string, secret: string): boolean {
  if (!secret || !signature) return false;
  const expected = createHmac("sha256", secret).update(payload).digest("hex");
  const received = signature.replace("sha256=", "");
  if (expected.length !== received.length) return false;
  let result = 0;
  for (let i = 0; i < expected.length; i++) {
    result |= expected.charCodeAt(i) ^ received.charCodeAt(i);
  }
  return result === 0;
}

// ─── Querystring types ────────────────────────────────────────────────────────
interface WebhookVerifyQuery {
  "hub.mode"?: string;
  "hub.verify_token"?: string;
  "hub.challenge"?: string;
}

async function buildServer() {
  const app = Fastify({
    logger: process.env.NODE_ENV !== "production",
    trustProxy: true,
  });

  // Plugins
  await app.register(fastifyWebsocket);

  const rateLimitPlugin = await import("@fastify/rate-limit");
  await app.register(rateLimitPlugin.default, {
    max: 100,
    timeWindow: "1 minute",
  });

  const corsPlugin = await import("@fastify/cors");
  await app.register(corsPlugin.default, {
    origin: process.env.ALLOWED_ORIGINS?.split(",") ?? ["http://localhost:3000"],
  });

  // ── Health check ───────────────────────────────────────────────────────────
  app.get("/health", async () => ({
    status: "ok",
    service: "gateway",
    timestamp: new Date().toISOString(),
  }));

  // ── WhatsApp webhook verification ──────────────────────────────────────────
  app.get<{ Querystring: WebhookVerifyQuery }>(
    "/webhooks/whatsapp",
    async (req: FastifyRequest<{ Querystring: WebhookVerifyQuery }>, reply: FastifyReply) => {
      const mode = req.query["hub.mode"];
      const token = req.query["hub.verify_token"];
      const challenge = req.query["hub.challenge"];

      if (mode === "subscribe" && token === WHATSAPP_VERIFY_TOKEN) {
        app.log.info("[WhatsApp] Webhook verified");
        return reply.send(challenge);
      }
      return reply.status(403).send({ error: "Forbidden" });
    }
  );

  // ── WhatsApp webhook receiver ──────────────────────────────────────────────
  app.post<{ Body: unknown }>(
    "/webhooks/whatsapp",
    async (req: FastifyRequest<{ Body: unknown }>, reply: FastifyReply) => {
      const signature = req.headers["x-hub-signature-256"] as string;
      const rawBody = JSON.stringify(req.body);

      if (WHATSAPP_APP_SECRET && !verifyMetaSignature(rawBody, signature, WHATSAPP_APP_SECRET)) {
        app.log.warn("[WhatsApp] Invalid signature");
        return reply.status(401).send({ error: "Invalid signature" });
      }

      try {
        const normalized = normalizeWhatsApp(
          req.body as Parameters<typeof normalizeWhatsApp>[0]
        );
        for (const msg of normalized) {
          await messageQueue.add("whatsapp_message", msg, {
            jobId: `wa_${msg.externalId}_${msg.timestamp.getTime()}`,
          });
          app.log.info(`[WhatsApp] Queued message from ${msg.externalId}`);
        }
        return reply.send({ status: "ok", queued: normalized.length });
      } catch (error) {
        app.log.error({ err: error }, "[WhatsApp] Error processing webhook:");
        return reply.status(500).send({ error: "Processing failed" });
      }
    }
  );

  // ── Instagram webhook verification ─────────────────────────────────────────
  app.get<{ Querystring: WebhookVerifyQuery }>(
    "/webhooks/instagram",
    async (req: FastifyRequest<{ Querystring: WebhookVerifyQuery }>, reply: FastifyReply) => {
      const mode = req.query["hub.mode"];
      const token = req.query["hub.verify_token"];
      const challenge = req.query["hub.challenge"];

      if (mode === "subscribe" && token === WHATSAPP_VERIFY_TOKEN) {
        app.log.info("[Instagram] Webhook verified");
        return reply.send(challenge);
      }
      return reply.status(403).send({ error: "Forbidden" });
    }
  );

  // ── Instagram webhook receiver ─────────────────────────────────────────────
  app.post<{ Body: unknown }>(
    "/webhooks/instagram",
    async (req: FastifyRequest<{ Body: unknown }>, reply: FastifyReply) => {
      const signature = req.headers["x-hub-signature-256"] as string;
      const rawBody = JSON.stringify(req.body);

      if (INSTAGRAM_APP_SECRET && !verifyMetaSignature(rawBody, signature, INSTAGRAM_APP_SECRET)) {
        return reply.status(401).send({ error: "Invalid signature" });
      }

      try {
        const normalized = normalizeInstagram(
          req.body as Parameters<typeof normalizeInstagram>[0]
        );
        for (const msg of normalized) {
          await messageQueue.add("instagram_message", msg, {
            jobId: `ig_${msg.externalId}_${msg.timestamp.getTime()}`,
          });
        }
        return reply.send({ status: "ok", queued: normalized.length });
      } catch (error) {
        app.log.error({ err: error }, "[Instagram] Error processing webhook:");
        return reply.status(500).send({ error: "Processing failed" });
      }
    }
  );

  // ── WebSocket Web Chat ─────────────────────────────────────────────────────
  app.get(
    "/ws",
    { websocket: true },
    (socket) => {
      const socketId = `ws_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      // Wrap socket with typed interface
      const client = socket as unknown as {
        send: (data: string) => void;
        readyState: number;
        on: (event: string, handler: (...args: unknown[]) => void) => void;
      };

      webClients.set(socketId, client);
      client.send(JSON.stringify({ type: "SESSION_ID", sessionId: socketId }));
      app.log.info(`[WS] Client connected: ${socketId}`);

      client.on("message", async (rawMessage: unknown) => {
        try {
          const text = Buffer.isBuffer(rawMessage)
            ? rawMessage.toString()
            : String(rawMessage);
          const data = JSON.parse(text) as {
            type: string;
            text?: string;
          };

          if (data.type === "MESSAGE" && data.text) {
            client.send(JSON.stringify({ type: "TYPING" }));

            const normalized: NormalizedMessage = {
              channel: "WEB",
              externalId: socketId,
              text: data.text,
              timestamp: new Date(),
              raw: data,
            };

            await messageQueue.add("web_message", normalized, {
              jobId: `web_${socketId}_${Date.now()}`,
            });
          }
        } catch (err) {
          app.log.error({ err }, "[WS] Error processing message");
          client.send(JSON.stringify({ type: "ERROR", message: "Error procesando mensaje" }));
        }
      });

      client.on("close", () => {
        webClients.delete(socketId);
        app.log.info(`[WS] Client disconnected: ${socketId}`);
      });

      client.on("error", (err: unknown) => {
        app.log.error({ err }, `[WS] Socket error for ${socketId}`);
        webClients.delete(socketId);
      });
    }
  );

  // ── SSE for dashboard ──────────────────────────────────────────────────────
  app.get("/sse/conversations", async (req: FastifyRequest, reply: FastifyReply) => {
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    const keepAlive = setInterval(() => {
      reply.raw.write(`data: {"type":"ping"}\n\n`);
    }, 30000);

    req.raw.on("close", () => {
      clearInterval(keepAlive);
    });
  });

  return app;
}

// Global function to send response back to WebSocket client
export function sendToWebClient(socketId: string, data: unknown) {
  const client = webClients.get(socketId);
  if (client?.readyState === 1) {
    client.send(JSON.stringify(data));
  }
}

// Start server
buildServer()
  .then(async (app) => {
    await app.listen({ port: PORT, host: "0.0.0.0" });
    console.log(`🚀 Gateway running on port ${PORT}`);
  })
  .catch((err) => {
    console.error("Gateway startup failed:", err);
    process.exit(1);
  });
