import { logger } from "../middleware/logger.js";

// Lightweight OTel GenAI semantic conventions (Hebo/Langfuse compatible) without heavy SDK
// If OTEL_EXPORTER_OTLP_ENDPOINT is set, we log OTel-enabled; full exporter can be added later with @opentelemetry/sdk-node

export function otelEnabled(): boolean {
  return !!process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
}

export function logGenAI(event: string, attrs: Record<string, unknown>) {
  if (!otelEnabled() && process.env.LOG_LEVEL !== "debug") return;
  // GenAI semantic conventions: https://opentelemetry.io/docs/specs/semconv/gen-ai/
  logger.info(
    {
      "gen_ai.system": attrs.provider || "gateway",
      "gen_ai.request.model": attrs.model,
      "gen_ai.response.model": attrs.responseModel,
      "gen_ai.usage.input_tokens": attrs.promptTokens,
      "gen_ai.usage.output_tokens": attrs.completionTokens,
      "gen_ai.operation.name": event,
      duration_ms: attrs.latencyMs,
      trace_id: attrs.traceId,
      ...attrs,
    },
    `gen_ai.${event}`
  );
}

export function withTrace<T>(fn: () => Promise<T>, attrs: Record<string, unknown> = {}): Promise<T> {
  const traceId = `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;
  const start = Date.now();
  return fn()
    .then((res) => {
      logGenAI("chat", { ...attrs, traceId, latencyMs: Date.now() - start, success: true });
      return res;
    })
    .catch((e) => {
      logGenAI("chat", { ...attrs, traceId, latencyMs: Date.now() - start, success: false, error: e.message });
      throw e;
    });
}
