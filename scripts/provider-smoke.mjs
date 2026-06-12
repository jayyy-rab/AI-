import { OpenAiProvider } from "../server/dist/ai/openAiProvider.js";

const originalFetch = globalThis.fetch;

try {
  await assertOpenAiProviderRequestAndStream();
  await assertOpenAiProviderHttpErrorRedaction();
  await assertOpenAiProviderStreamError();
  await assertOpenAiProviderStreamErrorRedaction();
  console.log("provider smoke ok");
} finally {
  globalThis.fetch = originalFetch;
}

async function assertOpenAiProviderRequestAndStream() {
  let capturedUrl = "";
  let capturedInit;

  globalThis.fetch = async (url, init) => {
    capturedUrl = String(url);
    capturedInit = init;
    return createSseResponse([
      { type: "response.created" },
      { type: "response.output_text.delta", delta: "你好" },
      { type: "response.output_text.delta", delta: "，我能看到画面。" },
      { type: "response.completed" }
    ]);
  };

  const provider = new OpenAiProvider({ apiKey: "provider-smoke-secret", model: "gpt-test" });
  const chunks = [];

  for await (const chunk of provider.streamResponse({
    sessionId: "session-smoke",
    text: "画面里有什么？",
    frameCount: 1,
    frames: [
      {
        receivedAt: Date.now(),
        mimeType: "image/jpeg",
        width: 2,
        height: 2,
        bytes: 128,
        dataUrl: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2w=="
      }
    ],
    recentMessages: [
      { role: "user", text: "上一轮问题" },
      { role: "assistant", text: "上一轮回答" },
      { role: "user", text: "画面里有什么？" }
    ]
  })) {
    chunks.push(chunk);
  }

  assert(capturedUrl === "https://api.openai.com/v1/responses", "provider called wrong URL");
  assert(capturedInit?.method === "POST", "provider did not use POST");
  assert(
    capturedInit?.headers?.Authorization === "Bearer provider-smoke-secret",
    "provider did not set authorization header"
  );

  const body = JSON.parse(String(capturedInit?.body));
  const serializedBody = JSON.stringify(body);
  const content = body.input?.[0]?.content ?? [];
  const imageInput = content.find((item) => item.type === "input_image");
  const textInput = content.find((item) => item.type === "input_text");

  assert(chunks.join("") === "你好，我能看到画面。", "provider did not stream text deltas");
  assert(body.model === "gpt-test", "provider did not use configured model");
  assert(body.stream === true, "provider did not request streaming");
  assert(textInput?.text.includes("Conversation context"), "provider did not include text context");
  assert(textInput?.text.includes("Current user request"), "provider did not include current request");
  assert(imageInput?.image_url?.startsWith("data:image/jpeg;base64,"), "provider did not include image data URL");
  assert(imageInput?.detail === "low", "provider did not request low-detail image input");
  assert(!serializedBody.includes("provider-smoke-secret"), "provider leaked API key in request body");
}

async function assertOpenAiProviderHttpErrorRedaction() {
  const leakedDataUrl = `data:image/jpeg;base64,${"A".repeat(120)}`;
  const leakedToken = "Bearer provider-smoke-secret";

  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        error: {
          message: `bad image ${leakedDataUrl} token ${leakedToken}`
        }
      }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" }
      }
    );

  const provider = new OpenAiProvider({ apiKey: "provider-smoke-secret", model: "gpt-test" });

  try {
    for await (const _chunk of provider.streamResponse({
      sessionId: "session-smoke",
      text: "test",
      frameCount: 1,
      frames: [
        {
          receivedAt: Date.now(),
          mimeType: "image/jpeg",
          width: 2,
          height: 2,
          bytes: 128,
          dataUrl: leakedDataUrl
        }
      ],
      recentMessages: []
    })) {
      // consume stream until it throws
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    assert(message.includes("OpenAI 请求失败：400"), "provider did not include HTTP status");
    assert(!message.includes(leakedDataUrl), "provider leaked data URL in HTTP error");
    assert(!message.includes("provider-smoke-secret"), "provider leaked token in HTTP error");
    assert(!message.includes("A".repeat(80)), "provider leaked long base64 in HTTP error");
    return;
  }

  throw new Error("provider did not throw on HTTP error response");
}

async function assertOpenAiProviderStreamError() {
  globalThis.fetch = async () =>
    createSseResponse([
      { type: "response.created" },
      { type: "error", error: { message: "rate limit from stream" } }
    ]);

  const provider = new OpenAiProvider({ apiKey: "provider-smoke-secret", model: "gpt-test" });

  try {
    for await (const _chunk of provider.streamResponse({
      sessionId: "session-smoke",
      text: "test",
      frameCount: 0,
      frames: [],
      recentMessages: []
    })) {
      // consume stream until it throws
    }
  } catch (err) {
    assert(
      err instanceof Error && err.message.includes("rate limit from stream"),
      "provider did not surface stream error message"
    );
    return;
  }

  throw new Error("provider did not throw on stream error event");
}

async function assertOpenAiProviderStreamErrorRedaction() {
  const leakedDataUrl = `data:image/jpeg;base64,${"B".repeat(120)}`;
  const leakedToken = "Bearer provider-smoke-secret";

  globalThis.fetch = async () =>
    createSseResponse([
      { type: "response.created" },
      {
        type: "response.failed",
        response: {
          error: {
            message: `stream failed ${leakedDataUrl} token ${leakedToken}`
          }
        }
      }
    ]);

  const provider = new OpenAiProvider({ apiKey: "provider-smoke-secret", model: "gpt-test" });

  try {
    for await (const _chunk of provider.streamResponse({
      sessionId: "session-smoke",
      text: "test",
      frameCount: 1,
      frames: [
        {
          receivedAt: Date.now(),
          mimeType: "image/jpeg",
          width: 2,
          height: 2,
          bytes: 128,
          dataUrl: leakedDataUrl
        }
      ],
      recentMessages: []
    })) {
      // consume stream until it throws
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    assert(message.includes("stream failed"), "provider dropped safe stream error context");
    assert(!message.includes(leakedDataUrl), "provider leaked data URL in stream error");
    assert(!message.includes("provider-smoke-secret"), "provider leaked token in stream error");
    assert(!message.includes("B".repeat(80)), "provider leaked long base64 in stream error");
    return;
  }

  throw new Error("provider did not throw on stream failed event");
}

function createSseResponse(events) {
  const encoder = new TextEncoder();

  return new Response(
    new ReadableStream({
      start(controller) {
        for (const event of events) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        }
        controller.close();
      }
    }),
    {
      status: 200,
      headers: { "Content-Type": "text/event-stream" }
    }
  );
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
