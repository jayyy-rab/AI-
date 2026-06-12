import type { FastifyInstance } from "fastify";
import { config } from "../config.js";
import type { SessionStore } from "../sessions/sessionStore.js";
import type { SqliteStorage } from "../storage/sqliteStorage.js";

interface SessionParams {
  sessionId: string;
}

export const registerSessionRoutes = (
  app: FastifyInstance,
  sessionStore: SessionStore,
  storage: SqliteStorage
): void => {
  app.post("/api/sessions", async () => {
    const session = sessionStore.create(config.maxSessionMs);
    storage.createSession(session);
    return {
      sessionId: session.id,
      expiresAt: session.expiresAt,
      wsPath: `/realtime?sessionId=${session.id}`
    };
  });

  app.get<{ Params: SessionParams }>("/api/sessions/:sessionId", async (request, reply) => {
    const session = sessionStore.get(request.params.sessionId);
    if (!session) {
      return reply.code(404).send({ error: "session_not_found" });
    }
    expireSessionIfNeeded(session.id, sessionStore, storage);

    return {
      sessionId: session.id,
      status: session.status,
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
      usage: sessionStore.toUsage(session)
    };
  });

  app.post<{ Params: SessionParams }>("/api/sessions/:sessionId/end", async (request, reply) => {
    const session = sessionStore.get(request.params.sessionId);
    if (!session) {
      return reply.code(404).send({ error: "session_not_found" });
    }

    sessionStore.end(session.id);
    storage.addUsageEvent(session.id, sessionStore.toUsage(session));
    storage.endSession(session);
    return {
      sessionId: session.id,
      status: session.status
    };
  });
};

const expireSessionIfNeeded = (
  sessionId: string,
  sessionStore: SessionStore,
  storage: SqliteStorage
): void => {
  const session = sessionStore.get(sessionId);
  if (!session || session.status === "ended" || Date.now() <= session.expiresAt) return;

  sessionStore.end(session.id);
  storage.addUsageEvent(session.id, sessionStore.toUsage(session));
  storage.endSession(session);
};
