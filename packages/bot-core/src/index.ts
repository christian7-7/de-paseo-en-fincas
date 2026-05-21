// Engine
export { processMessage } from "./engine";
export type { ProcessMessageResult } from "./engine";

// LLM
export { callLLM } from "./llm/router";
export type { LLMMessage, LLMTool, LLMResponse } from "./llm/router";

// RAG
export { generateEmbedding, searchKnowledge, indexFinca, indexFAQ } from "./rag/index";

// Assignment
export { assignAdvisor } from "./assignment";
export type { AdvisorScore, AssignmentResult } from "./assignment";

// Tools
export { TOOLS, TOOL_MAP, TOOL_DEFINITIONS } from "./tools/index";
export type { Tool, ToolResult } from "./tools/index";
