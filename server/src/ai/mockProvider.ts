import type { MultimodalProvider, ProviderTurnInput } from "./multimodalProvider.js";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class MockProvider implements MultimodalProvider {
  async *streamResponse(input: ProviderTurnInput): AsyncIterable<string> {
    const prompt = input.text.trim();
    const answer = prompt.includes("画面") || prompt.toLowerCase().includes("see")
      ? `Mock provider received ${input.frameCount} compressed frames, ${input.frames.length} cached vision frames, and ${input.recentMessages.length} text context turns. Switch to AI_PROVIDER=openai for real visual understanding.`
      : `Mock response to: ${prompt || "empty message"}. Context turns: ${input.recentMessages.length}.`;

    for (const chunk of answer.match(/.{1,12}/gu) ?? [answer]) {
      await wait(120);
      yield chunk;
    }
  }
}
