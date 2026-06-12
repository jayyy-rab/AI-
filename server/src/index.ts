import Fastify from "fastify";
import cors from "@fastify/cors";
import { config } from "./config.js";
import { createProvider } from "./ai/providerFactory.js";
import { CostController } from "./cost/costController.js";
import { registerRealtimeGateway } from "./realtime/realtimeGateway.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerSessionRoutes } from "./routes/sessions.js";
import { MetricsLogger } from "./metrics/metricsLogger.js";
import { SessionStore } from "./sessions/sessionStore.js";
import { SqliteStorage } from "./storage/sqliteStorage.js";

const app = Fastify({
  logger: true,
  bodyLimit: config.maxMessageBytes
});

await app.register(cors, {
  origin: true
});

const sessionStore = new SessionStore();
const storage = new SqliteStorage(config.databasePath);
const costController = new CostController();
const provider = createProvider();
const metrics = new MetricsLogger();

registerHealthRoutes(app);
registerSessionRoutes(app, sessionStore, storage);
registerRealtimeGateway({
  server: app.server,
  sessionStore,
  storage,
  costController,
  provider,
  metrics
});

await app.listen({ port: config.port, host: config.host });
