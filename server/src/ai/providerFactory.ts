import { config } from "../config.js";
import type { MultimodalProvider } from "./multimodalProvider.js";
import { MockProvider } from "./mockProvider.js";
import { OpenAiProvider } from "./openAiProvider.js";

export const createProvider = (): MultimodalProvider => {
  if (config.aiProvider === "mock") {
    return new MockProvider();
  }

  if (config.aiProvider === "openai") {
    if (!config.openAiApiKey) {
      throw new Error("AI_PROVIDER=openai 需要设置 OPENAI_API_KEY");
    }
    return new OpenAiProvider({
      apiKey: config.openAiApiKey,
      model: config.openAiModel
    });
  }

  throw new Error(`AI_PROVIDER=${config.aiProvider} 尚未实现`);
};
