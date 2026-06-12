import type { MultimodalProvider, ProviderTurnInput } from "./multimodalProvider.js";

interface OpenAiProviderOptions {
  apiKey: string;
  model: string;
}

type StreamEvent =
  | { type: "response.output_text.delta"; delta: string }
  | { type: "response.completed" }
  | { type: "response.failed"; response?: { error?: { message?: string } } }
  | { type: "error"; message?: string; error?: { message?: string } }
  | { type: string };

export class OpenAiProvider implements MultimodalProvider {
  constructor(private readonly options: OpenAiProviderOptions) {}

  async *streamResponse(input: ProviderTurnInput): AsyncIterable<string> {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.options.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: this.options.model,
        stream: true,
        instructions:
          "You are a concise Chinese multimodal assistant for a live camera demo. " +
          "Answer in Simplified Chinese. If images are insufficient, say what is uncertain.",
        input: [
          {
            role: "user",
            content: [
              { type: "input_text", text: buildPrompt(input) },
              ...input.frames.map((frame) => ({
                type: "input_image",
                image_url: frame.dataUrl,
                detail: "low"
              }))
            ]
          }
        ]
      })
    });

    if (!response.ok || !response.body) {
      throw new Error(`OpenAI 请求失败：${response.status}${await getSafeErrorSuffix(response)}`);
    }

    yield* parseResponseStream(response.body);
  }
}

const getSafeErrorSuffix = async (response: Response): Promise<string> => {
  try {
    const body = await response.text();
    const parsed = JSON.parse(body) as { error?: { message?: unknown } };
    const message = typeof parsed.error?.message === "string" ? parsed.error.message : "";
    const sanitized = sanitizeProviderError(message);
    return sanitized ? ` ${sanitized}` : "";
  } catch {
    return "";
  }
};

const sanitizeProviderError = (message: string): string =>
  message
    .replace(/data:[^,\s]+;base64,[A-Za-z0-9+/=]+/g, "[redacted-data-url]")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [redacted]")
    .replace(/[A-Za-z0-9+/]{80,}={0,2}/g, "[redacted-base64]")
    .slice(0, 160);

const parseResponseStream = async function* (body: ReadableStream<Uint8Array>): AsyncIterable<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";

    for (const part of parts) {
      const event = parseSseEvent(part);
      if (!event) continue;
      if (isOutputDelta(event)) yield event.delta;
      if (event.type === "response.failed") {
        const failedEvent = event as Extract<StreamEvent, { type: "response.failed" }>;
        throw new Error(sanitizeProviderError(failedEvent.response?.error?.message ?? "OpenAI 生成失败"));
      }
      if (event.type === "error") {
        const errorEvent = event as Extract<StreamEvent, { type: "error" }>;
        throw new Error(sanitizeProviderError(
          errorEvent.error?.message ?? errorEvent.message ?? "OpenAI 流式响应失败"
        ));
      }
    }
  }
};

const parseSseEvent = (chunk: string): StreamEvent | null => {
  const dataLine = chunk
    .split("\n")
    .find((line) => line.startsWith("data:"));

  if (!dataLine) return null;
  const data = dataLine.slice("data:".length).trim();
  if (!data || data === "[DONE]") return null;

  return JSON.parse(data) as StreamEvent;
};

const isOutputDelta = (
  event: StreamEvent
): event is Extract<StreamEvent, { type: "response.output_text.delta" }> =>
  event.type === "response.output_text.delta" && "delta" in event;

const buildPrompt = (input: ProviderTurnInput): string => {
  const context = input.recentMessages
    .slice(0, -1)
    .map((message) => `${message.role}: ${message.text}`)
    .join("\n");

  if (!context) return input.text;

  return `Conversation context:\n${context}\n\nCurrent user request:\n${input.text}`;
};
