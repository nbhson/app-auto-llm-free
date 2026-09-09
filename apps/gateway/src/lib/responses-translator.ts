import type { ChatRequest, ChatMessage, ResponsesRequest } from "../providers/base.js";

type InputItem = string | { role?: unknown; content?: unknown; tool_call_id?: string; name?: string; [key: string]: unknown };

function toText(raw: unknown): string {
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw)) return raw.map((p) => textOfPart(p)).join("");
  return String(raw ?? "");
}

function textOfPart(p: unknown): string {
  if (typeof p === "string") return p;
  if (p && typeof p === "object") {
    const part = p as { text?: unknown; content?: unknown };
    if (typeof part.text === "string") return part.text;
    if (typeof part.content === "string") return part.content;
  }
  return "";
}

export function translateResponsesToChat(req: ResponsesRequest): ChatRequest {
  const messages: ChatMessage[] = [];
  if (req.instructions) {
    messages.push({ role: "system", content: req.instructions });
  }
  const input = (req as { input?: unknown }).input;
  if (typeof input === "string") {
    messages.push({ role: "user", content: input });
  } else if (Array.isArray(input)) {
    for (const item of input as InputItem[]) {
      if (typeof item === "string") {
        messages.push({ role: "user", content: item });
      } else if (item && typeof item === "object") {
        if (typeof item.role === "string" && item.content !== undefined) {
          const raw = item.content;
          const content = typeof raw === "string" ? raw : String(raw ?? "");
          const safeRole = (["system", "user", "assistant", "tool"] as string[]).includes(item.role)
            ? (item.role as ChatMessage["role"])
            : "user";
          messages.push({
            role: safeRole,
            content,
            tool_call_id: item.tool_call_id,
            name: item.name,
          } as ChatMessage);
        } else if (Array.isArray(item.content)) {
          const text = item.content.map((p: unknown) => textOfPart(p)).join("\n");
          messages.push({ role: (item.role as ChatMessage["role"]) || "user", content: text });
        }
      }
    }
    if (messages.length === (req.instructions ? 1 : 0)) {
      messages.push({ role: "user", content: "" });
    }
  } else if (input && typeof input === "object") {
    const obj = input as { role?: unknown; content?: unknown };
    const role = (obj.role as ChatMessage["role"]) || "user";
    messages.push({ role, content: String(obj.content ?? "") });
  }
  const ext = req as { max_output_tokens?: number; max_tokens?: number; user?: string };
  return {
    model: req.model,
    messages,
    temperature: req.temperature,
    max_tokens: ext.max_output_tokens ?? ext.max_tokens,
    stream: req.stream,
    tools: req.tools as ChatRequest["tools"],
    tool_choice: req.tool_choice,
    user: ext.user,
  };
}

interface ChatLikeResponse {
  id?: unknown;
  model?: unknown;
  created?: unknown;
  choices?: Array<{ message?: { content?: unknown }; text?: unknown }>;
  content?: unknown;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

export function translateChatToResponses(chatData: unknown, model: string) {
  const data = (chatData ?? {}) as ChatLikeResponse;
  const choice = data.choices?.[0];
  const raw = choice?.message?.content ?? choice?.text ?? data.content ?? "";
  const text = toText(raw);
  const id =
    typeof data.id === "string" && data.id
      ? data.id.replace(/^chatcmpl-/, "resp_")
      : `resp_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const created_at = typeof data.created === "number" ? data.created : Math.floor(Date.now() / 1000);
  const usage = data.usage
    ? {
        input_tokens: data.usage.prompt_tokens ?? 0,
        output_tokens: data.usage.completion_tokens ?? 0,
        total_tokens: data.usage.total_tokens ?? 0,
        prompt_tokens: data.usage.prompt_tokens,
        completion_tokens: data.usage.completion_tokens,
      }
    : undefined;
  return {
    id,
    object: "response",
    created_at,
    created: created_at,
    model: (typeof data.model === "string" && data.model) || model,
    status: "completed",
    output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text }] }],
    usage,
  };
}

export function createResponsesStreamChunk(model: string, delta: string, isDone: boolean): string {
  if (isDone) {
    const done = JSON.stringify({ type: "response.completed", response: { model, status: "completed" } });
    return `data: ${done}\n\n` + `data: [DONE]\n\n`;
  }
  const payload = { type: "response.output_text.delta", delta, model, output_index: 0, content_index: 0 };
  return `data: ${JSON.stringify(payload)}\n\n`;
}
