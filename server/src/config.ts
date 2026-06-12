import "dotenv/config";

const numberFromEnv = (name: string, fallback: number): number => {
  const value = process.env[name];
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const config = {
  port: numberFromEnv("PORT", 4000),
  host: process.env.HOST ?? "0.0.0.0",
  aiProvider: process.env.AI_PROVIDER ?? "mock",
  openAiApiKey: process.env.OPENAI_API_KEY,
  openAiModel: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
  databasePath: process.env.DATABASE_PATH ?? "./data/app.sqlite",
  maxSessionMs: numberFromEnv("MAX_SESSION_MINUTES", 10) * 60 * 1000,
  maxMessageBytes: numberFromEnv("MAX_MESSAGE_BYTES", 512 * 1024),
  frameIntervalMs: numberFromEnv("FRAME_INTERVAL_MS", 1500),
  usagePushIntervalMs: numberFromEnv("USAGE_PUSH_INTERVAL_MS", 10_000),
  maxCachedFrames: numberFromEnv("MAX_CACHED_FRAMES", 3),
  maxContextMessages: numberFromEnv("MAX_CONTEXT_MESSAGES", 8)
};
