import Groq from "groq-sdk";
import OpenAI from "openai";

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

const deepseek = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com/v1",
});

export interface LLMMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
}

export interface LLMTool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface LLMResponse {
  content: string | null;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
  model: string;
  tokensUsed: number;
  latencyMs: number;
}

const GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || "deepseek-chat";
const GROQ_TIMEOUT_MS = parseInt(process.env.GROQ_TIMEOUT_MS || "8000", 10);
const LLM_MAX_TOKENS = parseInt(process.env.LLM_MAX_TOKENS || "1024", 10);
const LLM_TEMPERATURE = parseFloat(process.env.LLM_TEMPERATURE || "0.7");

async function callGroq(messages: LLMMessage[], tools: LLMTool[]): Promise<LLMResponse> {
  const startAt = Date.now();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GROQ_TIMEOUT_MS);

  try {
    const response = await groq.chat.completions.create(
      {
        model: GROQ_MODEL,
        messages: messages as Parameters<typeof groq.chat.completions.create>[0]["messages"],
        tools: tools.length > 0 ? (tools as Parameters<typeof groq.chat.completions.create>[0]["tools"]) : undefined,
        tool_choice: tools.length > 0 ? "auto" : undefined,
        max_tokens: LLM_MAX_TOKENS,
        temperature: LLM_TEMPERATURE,
      },
      { signal: controller.signal }
    );

    const choice = response.choices[0];
    const latencyMs = Date.now() - startAt;

    return {
      content: choice.message.content,
      tool_calls: choice.message.tool_calls as LLMResponse["tool_calls"],
      model: GROQ_MODEL,
      tokensUsed: response.usage?.total_tokens || 0,
      latencyMs,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function callDeepSeek(messages: LLMMessage[], tools: LLMTool[]): Promise<LLMResponse> {
  const startAt = Date.now();

  const response = await deepseek.chat.completions.create({
    model: DEEPSEEK_MODEL,
    messages: messages as Parameters<typeof deepseek.chat.completions.create>[0]["messages"],
    tools: tools.length > 0 ? (tools as Parameters<typeof deepseek.chat.completions.create>[0]["tools"]) : undefined,
    tool_choice: tools.length > 0 ? "auto" : undefined,
    max_tokens: LLM_MAX_TOKENS,
    temperature: LLM_TEMPERATURE,
  });

  const choice = response.choices[0];
  const latencyMs = Date.now() - startAt;

  return {
    content: choice.message.content,
    tool_calls: choice.message.tool_calls as LLMResponse["tool_calls"],
    model: DEEPSEEK_MODEL,
    tokensUsed: response.usage?.total_tokens || 0,
    latencyMs,
  };
}

export async function callLLM(
  messages: LLMMessage[],
  tools: LLMTool[] = []
): Promise<LLMResponse> {
  // Try Groq first with timeout
  try {
    const result = await callGroq(messages, tools);
    return result;
  } catch (groqError) {
    const errorMessage = groqError instanceof Error ? groqError.message : "Unknown error";
    console.warn(`[LLM Router] Groq failed (${errorMessage}), falling back to DeepSeek...`);

    // Fallback to DeepSeek
    try {
      const result = await callDeepSeek(messages, tools);
      return result;
    } catch (deepseekError) {
      const dsMessage = deepseekError instanceof Error ? deepseekError.message : "Unknown error";
      console.error(`[LLM Router] DeepSeek also failed: ${dsMessage}`);
      throw new Error(
        `Both LLM providers failed. Groq: ${errorMessage}. DeepSeek: ${dsMessage}`
      );
    }
  }
}
