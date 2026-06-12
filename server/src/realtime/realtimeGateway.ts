import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import type { MultimodalProvider } from "../ai/multimodalProvider.js";
import { config } from "../config.js";
import { CostController } from "../cost/costController.js";
import type { MetricsLogger } from "../metrics/metricsLogger.js";
import type { SessionStore } from "../sessions/sessionStore.js";
import type { SqliteStorage } from "../storage/sqliteStorage.js";
import type { ClientMessage, ServerMessage, SessionRecord } from "../types.js";

const sendJson = (socket: WebSocket, message: ServerMessage): void => {
  if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
};

const maxAudioChunkDurationMs = 5_000;

interface GatewayDeps {
  server: Server;
  sessionStore: SessionStore;
  storage: SqliteStorage;
  costController: CostController;
  provider: MultimodalProvider;
  metrics: MetricsLogger;
}

export const registerRealtimeGateway = ({
  server,
  sessionStore,
  storage,
  costController,
  provider,
  metrics
}: GatewayDeps): void => {
  const wss = new WebSocketServer({ server, path: "/realtime" });

  wss.on("connection", (socket, request) => {
    const url = new URL(request.url ?? "", "http://localhost");
    const sessionId = url.searchParams.get("sessionId");
    const session = sessionId ? sessionStore.get(sessionId) : undefined;

    if (!sessionId || !session) {
      sendJson(socket, { type: "error", message: "invalid sessionId" });
      socket.close(1008, "invalid session");
      return;
    }

    if (session.status === "ended") {
      sendJson(socket, { type: "session.ended", reason: "session already ended" });
      socket.close(1008, "session ended");
      return;
    }

    metrics.info({ event: "realtime_connected", sessionId: session.id });
    handleConnection(socket, session, sessionStore, storage, costController, provider, metrics);
  });
};

const handleConnection = (
  socket: WebSocket,
  session: SessionRecord,
  sessionStore: SessionStore,
  storage: SqliteStorage,
  costController: CostController,
  provider: MultimodalProvider,
  metrics: MetricsLogger
): void => {
  sendJson(socket, { type: "session.started", sessionId: session.id, expiresAt: session.expiresAt });

  const usageTimer = setInterval(() => {
    const usage = sessionStore.toUsage(session);
    storage.addUsageEvent(session.id, usage);
    sendJson(socket, { type: "usage", usage });
  }, config.usagePushIntervalMs);
  const expiryTimer = setTimeout(() => {
    if (session.status === "ended") return;
    sessionStore.end(session.id);
    sendJson(socket, { type: "session.ended", reason: "会话已超过最长时长" });
    socket.close(1000, "session expired");
  }, Math.max(0, session.expiresAt - Date.now()));

  socket.on("message", async (payload) => {
    const raw = payload.toString();
    const sizeError = costController.validateMessageSize(Buffer.byteLength(raw));
    if (sizeError) {
      sendJson(socket, { type: "error", message: sizeError });
      return;
    }

    const sessionError = costController.validateSession(session);
    if (sessionError) {
      sessionStore.end(session.id);
      sendJson(socket, { type: "session.ended", reason: sessionError });
      socket.close(1000, sessionError);
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      sendJson(socket, { type: "error", message: "invalid JSON message" });
      return;
    }

    if (!isClientMessage(parsed)) {
      sendJson(socket, { type: "error", message: "invalid client message" });
      return;
    }

    await handleClientMessage(
      parsed,
      socket,
      session,
      sessionStore,
      storage,
      costController,
      provider,
      metrics
    );
  });

  socket.on("close", () => {
    clearInterval(usageTimer);
    clearTimeout(expiryTimer);
    if (session.status !== "ended") sessionStore.end(session.id);
    storage.addUsageEvent(session.id, sessionStore.toUsage(session));
    storage.endSession(session);
    metrics.info({ event: "realtime_closed", sessionId: session.id });
  });
};

const handleClientMessage = async (
  message: ClientMessage,
  socket: WebSocket,
  session: SessionRecord,
  sessionStore: SessionStore,
  storage: SqliteStorage,
  costController: CostController,
  provider: MultimodalProvider,
  metrics: MetricsLogger
): Promise<void> => {
  if (message.type === "control") {
    if (message.action === "pause") {
      session.status = "paused";
      sendJson(socket, { type: "session.paused" });
    } else if (message.action === "resume" || message.action === "start") {
      session.status = "active";
      sendJson(socket, { type: "session.resumed" });
    } else {
      session.status = "ended";
      sessionStore.end(session.id);
      sendJson(socket, { type: "session.ended", reason: "user ended session" });
      socket.close(1000, "ended");
    }
    return;
  }

  if (session.status === "paused") {
    sendJson(socket, { type: "error", message: "session paused" });
    return;
  }

  if (message.type === "frame") {
    const frameBytes = getDataUrlByteLength(message.dataUrl, message.mimeType);
    if (frameBytes === null) {
      sendJson(socket, { type: "error", message: "invalid image frame" });
      return;
    }

    const error = costController.registerFrame(session, frameBytes);
    if (error) sendJson(socket, { type: "error", message: error });
    if (!error) {
      session.recentFrames = [
        ...session.recentFrames,
        {
          receivedAt: Date.now(),
          mimeType: message.mimeType,
          width: message.width,
          height: message.height,
          bytes: frameBytes,
          dataUrl: message.dataUrl
        }
      ].slice(-config.maxCachedFrames);
      metrics.info({
        event: "frame_received",
        sessionId: session.id,
        frameCount: session.frameCount,
        estimatedCostUsd: session.estimatedCostUsd
      });
    }
    return;
  }

  if (message.type === "audio") {
    const audioBytes = getDataUrlByteLength(message.dataUrl, message.mimeType);
    if (audioBytes === null || audioBytes !== message.bytes) {
      sendJson(socket, { type: "error", message: "invalid audio chunk" });
      return;
    }

    costController.registerAudio(session, message.durationMs);
    metrics.info({
      event: "audio_received",
      sessionId: session.id,
      audioSeconds: Math.round(session.audioMs / 100) / 10,
      estimatedCostUsd: session.estimatedCostUsd
    });
    return;
  }

  costController.registerTextMessage(session);
  const userMessageId = randomUUID();
  const userText = sanitizeTextContent(message.text).slice(0, 4000);
  storage.addMessage(userMessageId, session.id, "user", userText);
  sessionStore.appendMessage(session.id, "user", userText, config.maxContextMessages);

  const assistantMessageId = randomUUID();
  let assistantText = "";
  const startedAt = Date.now();
  try {
    for await (const delta of provider.streamResponse({
      sessionId: session.id,
      text: userText,
      frameCount: session.frameCount,
      frames: session.recentFrames,
      recentMessages: session.recentMessages
    })) {
      assistantText += delta;
      sendJson(socket, { type: "ai.delta", messageId: assistantMessageId, text: delta });
    }
  } catch (err) {
    metrics.error({
      event: "ai_turn_failed",
      sessionId: session.id,
      latencyMs: Date.now() - startedAt,
      error: err instanceof Error ? err.message : "unknown"
    });
    sendJson(socket, {
      type: "error",
      message: err instanceof Error ? err.message : "AI provider failed"
    });
    return;
  }

  storage.addMessage(assistantMessageId, session.id, "assistant", assistantText);
  sessionStore.appendMessage(session.id, "assistant", assistantText, config.maxContextMessages);
  metrics.info({
    event: "ai_turn_completed",
    sessionId: session.id,
    latencyMs: Date.now() - startedAt,
    frameCount: session.frameCount,
    messageCount: session.messageCount,
    estimatedCostUsd: session.estimatedCostUsd,
    outputChars: assistantText.length
  });
  sendJson(socket, { type: "ai.done", messageId: assistantMessageId });
  sendJson(socket, { type: "usage", usage: sessionStore.toUsage(session) });
};

const getDataUrlByteLength = (dataUrl: string, mimeType: string): number | null => {
  const prefix = `data:${mimeType};base64,`;
  if (!dataUrl.startsWith(prefix)) return null;

  const base64 = dataUrl.slice(prefix.length);
  if (!base64 || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64) || base64.length % 4 !== 0) {
    return null;
  }

  return Buffer.byteLength(base64, "base64");
};

const sanitizeTextContent = (text: string): string =>
  text
    .replace(/data:[^,\s]+;base64,[A-Za-z0-9+/=]+/g, "[redacted-data-url]")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [redacted]")
    .replace(/[A-Za-z0-9+/]{120,}={0,2}/g, "[redacted-base64]");

const isClientMessage = (value: unknown): value is ClientMessage => {
  if (!isRecord(value) || typeof value.type !== "string") return false;

  if (value.type === "control") {
    return value.action === "start" || value.action === "pause" ||
      value.action === "resume" || value.action === "end";
  }

  if (value.type === "text") {
    return typeof value.text === "string";
  }

  if (value.type === "frame") {
    return value.mimeType === "image/jpeg" &&
      isPositiveNumber(value.width) &&
      isPositiveNumber(value.height) &&
      isNonNegativeNumber(value.bytes) &&
      typeof value.dataUrl === "string";
  }

  if (value.type === "audio") {
    return typeof value.mimeType === "string" &&
      value.mimeType.startsWith("audio/") &&
      isNonNegativeNumber(value.durationMs) &&
      value.durationMs <= maxAudioChunkDurationMs &&
      isNonNegativeNumber(value.bytes) &&
      typeof value.dataUrl === "string";
  }

  return false;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isPositiveNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value > 0;

const isNonNegativeNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;
