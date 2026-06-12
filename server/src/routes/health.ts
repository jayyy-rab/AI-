import type { FastifyInstance } from "fastify";
import { config } from "../config.js";

export const registerHealthRoutes = (app: FastifyInstance): void => {
  app.get("/health", async () => ({
    ok: true,
    provider: config.aiProvider,
    service: "ai-vision-voice-assistant",
    time: new Date().toISOString()
  }));
};
