import type { ChatRequest, AnthropicRequest } from "../providers/base.js";
import { createOpenAIChunk } from "./format-translator.js";

interface ContentPart {
  type?: string;
  text?: string;
  image_url?: { url?: string };
  [key: string]: unknown;
}

interface OpenAITool {
  function?: { name?: string; description?: string; parameters?: unknown; input_schema?: unknown };
  name?: string;
  description?: string;
  [key: string]: unknown;
}

interface AnthropicContentBlock {
  type?: string;
  text?: string;
  id?: string;
  name?: string;
  input?: unknown;
  [key: string]: unknown;
}

interface AnthropicResponse {
  id?: string;
  content?: AnthropicContentBlock[];
  usage?: { input_tokens?: number; output_tokens?: number };
  stop_reason?: string;
}

/**
 * Translate OpenAI ChatRequest -> Anthropic messages request.
 * - system messages concatenated into `system` string
 * - user/assistant messages keep content as string or array
 * - tools mapped to Anthropic tools {name, description, input_schema}
 * - tool_choice handling
 */
export function translateOpenAIToAnthropic(req: ChatRequest): AnthropicRequest {
  const systemMessages = req.messages.filter((m) => m.role === "system");
  const system = systemMessages
    .map((m) => (typeof m.content === "string" ? m.content : JSON.stringify(m.content)))
    .join("\n") || undefined;

  const messages: AnthropicRequest["messages"] = req.messages
    .filter((m) => m.role !== "system")
    .map((m) => {
      // tool role -> user with tool_result block (Anthropic format)
      if (m.role === "tool") {
        const content = typeof m.content === "string" ? m.content : JSON.stringify(m.content);
        return {
          role: "user" as const,
          content: [
            {
              type: "tool_result",
              tool_use_id: m.tool_call_id || "",
              content,
            },
          ],
        };
      }
      const role = m.role === "assistant" ? ("assistant" as const) : ("user" as const);
      // Preserve string or array content
      let content: string | Array<{ type: string; text?: string; source?: unknown; tool_use_id?: string; content?: string }> = "";
      if (typeof m.content === "string") {
        content = m.content;
      } else if (Array.isArray(m.content)) {
        content = (m.content as ContentPart[]).map((part) => {
          if (part.type === "text" && part.text) return { type: "text", text: part.text };
          if (part.type === "image_url" && part.image_url?.url) {
            return { type: "image", source: { type: "url", url: part.image_url.url } };
          }
          return { type: "text", text: typeof part.text === "string" ? part.text : JSON.stringify(part) };
        });
      } else {
        content = JSON.stringify(m.content);
      }
      return { role, content };
    });

  // Tools: OpenAI {type:"function", function:{name,description,parameters}} -> Anthropic {name, description, input_schema}
  let tools: unknown[] | undefined;
  if (req.tools && Array.isArray(req.tools) && req.tools.length > 0) {
    tools = (req.tools as OpenAITool[]).map((t) => {
      const fn = t.function || t;
      return {
        name: fn.name,
        description: fn.description || "",
        input_schema: fn.parameters || fn.input_schema || { type: "object", properties: {} },
      };
    });
  }

  // tool_choice mapping
  let tool_choice: unknown = undefined;
  if (req.tool_choice !== undefined && req.tool_choice !== null) {
    const tc = req.tool_choice as { type?: string; function?: { name?: string } } | string;
    if (typeof tc === "string") {
      if (tc === "auto") tool_choice = { type: "auto" };
      else if (tc === "none") tool_choice = { type: "none" };
      else if (tc === "required") tool_choice = { type: "any" };
      else tool_choice = { type: "auto" };
    } else if (tc.type === "function" && tc.function?.name) {
      tool_choice = { type: "tool", name: tc.function.name };
    } else {
      tool_choice = tc;
    }
  }

  return {
    model: req.model,
    messages,
    max_tokens: req.max_tokens || 4096,
    system,
    temperature: req.temperature,
    top_p: req.top_p,
    top_k: req.top_k,
    stream: req.stream,
    tools,
    tool_choice,
    stop_sequences: Array.isArray(req.stop) ? req.stop : req.stop ? [req.stop] : undefined,
  };
}

/**
 * Translate Anthropic response -> OpenAI ChatCompletion.
 * Anthropic: {id, content:[{type:text,text}], usage:{input_tokens, output_tokens}, stop_reason}
 * OpenAI: {id, object:"chat.completion", created, model, choices:[{message:{role:"assistant", content:text}, finish_reason}], usage}
 */
export function translateAnthropicToOpenAI(data: AnthropicResponse, model: string) {
  const textParts: string[] = [];
  const toolCalls: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }> = [];
  if (Array.isArray(data.content)) {
    for (const block of data.content) {
      if (block.type === "text" && typeof block.text === "string") {
        textParts.push(block.text);
      } else if (block.type === "tool_use" && typeof block.name === "string") {
        // Preserve agentic tool calls (previously dropped — Claude via gateway lost tool_calls silently)
        toolCalls.push({
          id: typeof block.id === "string" && block.id ? block.id : `toolu_${toolCalls.length}`,
          type: "function",
          function: { name: block.name, arguments: JSON.stringify(block.input ?? {}) },
        });
      }
    }
  }
  const content = textParts.join("") || data.content?.[0]?.text || "";

  const finishMap: Record<string, string> = {
    end_turn: "stop",
    max_tokens: "length",
    stop_sequence: "stop",
    tool_use: "tool_calls",
  };
  const finish_reason = toolCalls.length > 0 ? "tool_calls" : finishMap[data.stop_reason ?? ""] || data.stop_reason || "stop";

  return {
    id: data.id || `chatcmpl-${Date.now()}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        message: toolCalls.length > 0 ? { role: "assistant", content, tool_calls: toolCalls } : { role: "assistant", content },
        finish_reason,
      },
    ],
    usage: {
      prompt_tokens: data.usage?.input_tokens || 0,
      completion_tokens: data.usage?.output_tokens || 0,
      total_tokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
    },
  };
}

/**
 * Convert Anthropic streaming events to OpenAI SSE chunks.
 * Handles: message_start, content_block_delta (text), message_delta, message_stop
 */
export function anthropicStreamToOpenAIChunk(chunk: unknown, model: string): string[] {
  const out: string[] = [];
  if (!chunk || typeof chunk !== "object") return out;

  const event = chunk as { type?: string; delta?: { text?: string; stop_reason?: string } };
  const type = event.type;

  if (type === "message_start") {
    // No content yet, optionally send role chunk
    // We emit empty content chunk to signal start
    return out;
  }

  if (type === "content_block_start") {
    return out;
  }

  if (type === "content_block_delta") {
    const text = event.delta?.text || "";
    if (text) {
      out.push(createOpenAIChunk(model, text));
    }
    return out;
  }

  if (type === "message_delta") {
    // Contains stop_reason and usage delta
    const reason = event.delta?.stop_reason;
    if (reason) {
      const finishMap: Record<string, string> = {
        end_turn: "stop",
        max_tokens: "length",
        stop_sequence: "stop",
        tool_use: "tool_calls",
      };
      const finish = finishMap[reason] || reason;
      out.push(createOpenAIChunk(model, "", finish));
    }
    return out;
  }

  if (type === "message_stop") {
    out.push(createOpenAIChunk(model, "", "stop"));
    out.push("data: [DONE]\n\n");
    return out;
  }

  // Fallback: if chunk already contains Anthropic content block with text
  if (event.delta?.text) {
    out.push(createOpenAIChunk(model, event.delta.text));
  }

  return out;
}
