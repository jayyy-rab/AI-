import "dotenv/config";
import Fastify from "fastify";

const server = Fastify({
  logger: true
});

server.get("/health", async () => {
  return {
    ok: true,
    service: "ai-vision-voice-assistant"
  };
});

const port = Number.parseInt(process.env.PORT ?? "8787", 10);
const host = process.env.HOST ?? "127.0.0.1";

try {
  await server.listen({ port, host });
} catch (error) {
  server.log.error(error);
  process.exit(1);
}
