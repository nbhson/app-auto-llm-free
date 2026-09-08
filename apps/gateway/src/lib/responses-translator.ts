import type { ChatRequest, ChatMessage, ResponsesRequest } from "../providers/base.js";

export function translateResponsesToChat(req: ResponsesRequest): ChatRequest {
  const messages: ChatMessage[] = [];
  if (req.instructions) {
    messages.push({ role: "system", content: req.instructions });
  }
  const input: any = (req as any).input;
  if (typeof input === "string") {
    messages.push({ role: "user", content: input });
  } else if (Array.isArray(input)) {
    for (const item of input) {
      if (typeof item === "string") {
        messages.push({ role: "user", content: item });
      } else if (item && typeof item === "object") {
        if (typeof item.role === "string" && item.content !== undefined) {
          const role = item.role as ChatMessage["role"];
          const raw = item.content;
          const content = typeof raw === "string" ? raw : String(raw ?? "");
          const safeRole = (["system", "user", "assistant", "tool"] as string[]).includes(role) ? role : "user";
          messages.push({
            role: safeRole as ChatMessage["role"],
            content,
            tool_call_id: item.tool_call_id,
            name: item.name,
          } as ChatMessage);
        } else if (Array.isArray(item.content)) {
          const text = item.content.map((p: any) => p.text || p.content || "").join("\n");
          messages.push({ role: (item.role as any) || "user", content: text });
        }
      }
    }
    if (messages.length === (req.instructions ? 1 : 0)) {
      messages.push({ role: "user", content: "" });
    }
  } else if (input && typeof input === "object") {
    const role = (input.role as ChatMessage["role"]) || "user";
    messages.push({ role: role as ChatMessage["role"], content: String((input as any).content ?? "") });
  }
  return {
    model: req.model,
    messages,
    temperature: req.temperature,
    max_tokens: (req as any).max_output_tokens ?? (req as any).max_tokens,
    stream: req.stream,
    tools: req.tools as any,
    tool_choice: req.tool_choice as any,
    user: (req as any).user,
  };
}

export function translateChatToResponses(chatData: any, model: string): any {
  const choice = chatData?.choices?.[0];
  const raw = choice?.message?.content ?? choice?.text ?? chatData?.content ?? "";
  const text =
    typeof raw === "string"
      ? raw
      : Array.isArray(raw)
        ? raw.map((p: any) => p.text || p.content || "").join("")
        : String(raw ?? "");
  const id = chatData?.id
    ? String(chatData.id).replace(/^chatcmpl-/, "resp_")
    : `resp_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const created_at = chatData?.created ?? Math.floor(Date.now() / 1000);
  const usage = chatData?.usage
    ? {
        input_tokens: chatData.usage.prompt_tokens ?? 0,
        output_tokens: chatData.usage.completion_tokens ?? 0,
        total_tokens: chatData.usage.total_tokens ?? 0,
        prompt_tokens: chatData.usage.prompt_tokens,
        completion_tokens: chatData.usage.completion_tokens,
      }
    : undefined;
  return {
    id,
    object: "response",
    created_at,
    created: created_at,
    model: chatData?.model || model,
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
