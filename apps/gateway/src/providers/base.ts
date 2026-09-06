export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
  tool_call_id?: string;
  name?: string;
}

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
  tools?: unknown[];
  tool_choice?: unknown;
  top_p?: number;
  top_k?: number;
  n?: number;
  stop?: string | string[];
  presence_penalty?: number;
  frequency_penalty?: number;
  user?: string;
}

export interface ModelInfo {
  id: string;
  provider: string;
  displayName?: string;
  contextLength?: number;
  ownedBy?: string;
}

export interface Provider {
  id: string;
  type: "openai-compatible" | "gemini" | "anthropic" | "scraped";
  chat(req: ChatRequest, apiKey: string): Promise<Response>;
  models(apiKey?: string): Promise<ModelInfo[]>;
  health(apiKey: string): Promise<boolean>;
}
