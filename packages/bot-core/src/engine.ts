import { db } from "@repo/db";
import type { Channel, BotSessionState } from "@repo/db";
import type { Prisma } from "@prisma/client";
import type { NormalizedMessage } from "@repo/types";
import { callLLM, type LLMMessage } from "./llm/router";
import { TOOL_DEFINITIONS, TOOL_MAP } from "./tools/index";

const SESSION_TTL_HOURS = parseInt(process.env.SESSION_TTL_HOURS || "24", 10);
const MAX_CONTEXT_MESSAGES = parseInt(process.env.BOT_MAX_CONTEXT_MESSAGES || "20", 10);
const MAX_TOOL_ITERATIONS = parseInt(process.env.BOT_MAX_TOOL_ITERATIONS || "5", 10);

export interface ProcessMessageResult {
  text: string;
  sessionId: string;
  state: BotSessionState;
  escalated: boolean;
  toolsUsed: string[];
  model: string;
  latencyMs: number;
}

// Load system prompt from DB (with in-memory cache)
let cachedSystemPrompt: string | null = null;
let systemPromptCachedAt: Date | null = null;
const SYSTEM_PROMPT_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

async function getSystemPrompt(): Promise<string> {
  const now = new Date();
  if (
    cachedSystemPrompt &&
    systemPromptCachedAt &&
    now.getTime() - systemPromptCachedAt.getTime() < SYSTEM_PROMPT_CACHE_TTL_MS
  ) {
    return cachedSystemPrompt;
  }

  const config = await db.botConfig.findUnique({ where: { key: "system_prompt" } });
  const prompt =
    (config?.value as { text?: string } | null)?.text ||
    "Eres Paseo, asistente virtual de De Paseo en Fincas. Ayudas a los clientes a encontrar y reservar fincas en Colombia.";

  cachedSystemPrompt = prompt;
  systemPromptCachedAt = now;
  return prompt;
}

export async function processMessage(
  externalId: string,
  channel: Channel,
  messageText: string,
  mediaUrl?: string
): Promise<ProcessMessageResult> {
  const startAt = Date.now();

  // ── Load or create session ──────────────────────────────────────────────────
  const ttlExpiresAt = new Date(Date.now() + SESSION_TTL_HOURS * 60 * 60 * 1000);

  let session = await db.botSession.findUnique({
    where: { channel_externalId: { channel, externalId } },
    include: { botMessages: { orderBy: { createdAt: "asc" }, take: MAX_CONTEXT_MESSAGES } },
  });

  if (!session) {
    session = await db.botSession.create({
      data: {
        channel,
        externalId,
        state: "IDLE",
        ttlExpiresAt,
        messages: [],
        extractedEntities: {},
      },
      include: { botMessages: { orderBy: { createdAt: "asc" }, take: MAX_CONTEXT_MESSAGES } },
    });
  } else {
    // Refresh TTL on activity
    await db.botSession.update({
      where: { id: session.id },
      data: { ttlExpiresAt },
    });
  }

  // ── Save user message ───────────────────────────────────────────────────────
  await db.botMessage.create({
    data: {
      sessionId: session.id,
      role: "USER",
      content: messageText,
    },
  });

  // ── Build LLM messages ──────────────────────────────────────────────────────
  const systemPrompt = await getSystemPrompt();
  const contextMessages: LLMMessage[] = [
    { role: "system", content: systemPrompt },
    ...session.botMessages.map((m) => ({
      role: m.role.toLowerCase() as LLMMessage["role"],
      content: m.content,
      ...(m.toolName && m.toolOutput
        ? { tool_call_id: m.id, name: m.toolName }
        : {}),
    })),
    { role: "user", content: messageText },
  ];

  // ── Agentic loop ────────────────────────────────────────────────────────────
  let finalResponse = "";
  let totalLatencyMs = 0;
  let lastModel = "";
  const toolsUsed: string[] = [];
  let iterations = 0;
  let escalated = false;

  const currentMessages = [...contextMessages];

  while (iterations < MAX_TOOL_ITERATIONS) {
    iterations++;

    const llmResult = await callLLM(currentMessages, TOOL_DEFINITIONS);
    totalLatencyMs += llmResult.latencyMs;
    lastModel = llmResult.model;

    // Save bot message to DB
    await db.botMessage.create({
      data: {
        sessionId: session.id,
        role: "BOT",
        content: llmResult.content || "",
        tokensUsed: llmResult.tokensUsed,
        model: llmResult.model,
        latencyMs: llmResult.latencyMs,
      },
    });

    // No tool calls → final answer
    if (!llmResult.tool_calls || llmResult.tool_calls.length === 0) {
      finalResponse = llmResult.content || "";
      break;
    }

    // Add assistant message with tool calls to context
    currentMessages.push({
      role: "assistant",
      content: llmResult.content,
      tool_calls: llmResult.tool_calls,
    });

    // Execute each tool
    for (const toolCall of llmResult.tool_calls) {
      const toolName = toolCall.function.name;
      const tool = TOOL_MAP.get(toolName);
      toolsUsed.push(toolName);

      if (toolName === "escalate_to_advisor") {
        escalated = true;
      }

      let toolOutput: unknown;

      if (!tool) {
        toolOutput = { success: false, error: `Tool "${toolName}" not found` };
      } else {
        try {
          const args = JSON.parse(toolCall.function.arguments);
          // Inject sessionId for escalation tool
          if (toolName === "escalate_to_advisor" && !args.sessionId) {
            args.sessionId = session.id;
          }
          toolOutput = await tool.execute(args);
        } catch (err) {
          toolOutput = { success: false, error: err instanceof Error ? err.message : "Tool execution error" };
        }
      }

      // Save tool call + result to DB
      await db.botMessage.create({
        data: {
          sessionId: session.id,
          role: "TOOL",
          content: JSON.stringify(toolOutput),
          toolName,
          toolInput: JSON.parse(toolCall.function.arguments) as Prisma.InputJsonValue,
          toolOutput: toolOutput as Prisma.InputJsonValue,
        },
      });

      // Add tool result to context
      currentMessages.push({
        role: "tool",
        content: JSON.stringify(toolOutput),
        tool_call_id: toolCall.id,
      });
    }
  }

  if (!finalResponse) {
    finalResponse = "Lo siento, tuve un problema procesando tu solicitud. ¿Puedes reformular tu pregunta? 🙏";
  }

  // ── Update session state ────────────────────────────────────────────────────
  let newState: BotSessionState = session.state;

  if (escalated) {
    newState = "ESCALATED";
  } else if (toolsUsed.includes("create_reservation")) {
    newState = "BOOKING";
  } else if (toolsUsed.includes("send_payment_link")) {
    newState = "PAYING";
  } else if (toolsUsed.includes("get_quote")) {
    newState = "QUOTING";
  } else if (toolsUsed.includes("search_fincas") || toolsUsed.includes("check_availability")) {
    newState = "SEARCHING";
  }

  await db.botSession.update({
    where: { id: session.id },
    data: { state: newState, ttlExpiresAt },
  });

  return {
    text: finalResponse,
    sessionId: session.id,
    state: newState,
    escalated,
    toolsUsed,
    model: lastModel,
    latencyMs: Date.now() - startAt,
  };
}
