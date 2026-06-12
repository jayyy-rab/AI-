import { spawn } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, rmSync } from "node:fs";
import { setTimeout as wait } from "node:timers/promises";
import WebSocket from "ws";

const port = 4100;
const databasePath = "./server/data/smoke.sqlite";
const base = `http://localhost:${port}`;

rmSync(databasePath, { force: true });

const server = spawn("node", ["server/dist/index.js"], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    PORT: String(port),
    HOST: "127.0.0.1",
    AI_PROVIDER: "mock",
    OPENAI_API_KEY: "smoke-secret-that-must-not-leak",
    DATABASE_PATH: databasePath,
    USAGE_PUSH_INTERVAL_MS: "100"
  },
  stdio: ["ignore", "pipe", "pipe"]
});

let stderr = "";
server.stderr.on("data", (chunk) => {
  stderr += chunk.toString();
});
server.stdout.on("data", () => undefined);

try {
  await waitForHealth();
  const session = await createSession();
  await assertSessionStatusEndpoint(session.sessionId, "active");
  const answer = await runRealtimeRound(session.wsPath);
  assert(answer.includes("cached vision frames"), "mock response did not include frame context");
  await endSession(session.sessionId);
  await assertSessionStatusEndpoint(session.sessionId, "ended");
  await assertEndedSessionRejectsMessages();
  await assertMalformedClientMessagesRejected();
  await runCostGuardChecks();
  await assertForgedFrameBytesRejected();
  await assertForgedAudioBytesRejected();
  await assertTextMediaPayloadsAreRedacted();
  assertPrivateSqliteSchema();
  assertUsageEventsRecorded();
  await assertSessionEndClearsVisionCache();
  assertFrameSamplerCadence();
  await assertShortSessionsExpire();
  console.log("smoke ok");
} finally {
  server.kill();
}

async function waitForHealth() {
  await waitForServerHealth(base, () => stderr);
}

async function waitForServerHealth(baseUrl, getStderr) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) {
        const body = await response.json();
        const serialized = JSON.stringify(body);

        assert(body.ok === true, "health did not return ok");
        assert(body.provider === "mock", "health did not expose provider mode");
        assert(!serialized.includes("OPENAI_API_KEY"), "health leaked key name");
        assert(!serialized.includes("smoke-secret-that-must-not-leak"), "health leaked key value");
        return;
      }
    } catch {
      await wait(250);
    }
  }

  throw new Error(`server did not become healthy: ${getStderr().slice(-500)}`);
}

async function createSession() {
  const response = await fetch(`${base}/api/sessions`, { method: "POST" });
  assert(response.ok, `create session failed: ${response.status}`);
  const body = await response.json();
  assert(typeof body.sessionId === "string", "missing sessionId");
  assert(typeof body.wsPath === "string", "missing wsPath");
  return body;
}

async function runRealtimeRound(wsPath) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}${wsPath}`);
  let text = "";
  let sawUsage = false;
  const startedAt = Date.now();

  const answer = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("realtime timeout")), 8000);

    socket.on("open", () => {
      socket.send(JSON.stringify({
        type: "frame",
        mimeType: "image/jpeg",
        width: 2,
        height: 2,
        bytes: 120,
        dataUrl: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2w=="
      }));
      socket.send(JSON.stringify({
        type: "audio",
        mimeType: "audio/webm",
        durationMs: 1000,
        bytes: 3,
        dataUrl: "data:audio/webm;base64,AAAA"
      }));
      setTimeout(() => {
        socket.send(JSON.stringify({ type: "text", text: "what can you see in the image?" }));
      }, 200);
    });

    socket.on("message", (payload) => {
      const message = JSON.parse(payload.toString());
      if (message.type === "ai.delta") text += message.text;
      if (message.type === "usage") sawUsage = true;
      if (message.type === "ai.done") {
        clearTimeout(timeout);
        resolve(text);
      }
      if (message.type === "error") {
        clearTimeout(timeout);
        reject(new Error(message.message));
      }
    });

    socket.on("error", reject);
  });

  socket.close();
  assert(Date.now() - startedAt < 3000, "mock first round exceeded 3 second target");
  assert(sawUsage, "realtime session did not push usage on interval");
  return answer;
}

async function endSession(sessionId) {
  const response = await fetch(`${base}/api/sessions/${sessionId}/end`, { method: "POST" });
  assert(response.ok, `end session failed: ${response.status}`);
  const body = await response.json();
  assert(body.status === "ended", "session did not end");
}

async function assertSessionStatusEndpoint(sessionId, expectedStatus) {
  const response = await fetch(`${base}/api/sessions/${sessionId}`);
  assert(response.ok, `session status failed: ${response.status}`);
  const body = await response.json();
  const serialized = JSON.stringify(body).toLowerCase();

  assert(body.sessionId === sessionId, "session status returned wrong sessionId");
  assert(body.status === expectedStatus, `session status was not ${expectedStatus}`);
  assert(typeof body.usage?.frameCount === "number", "session status missing usage");
  assert(!serialized.includes("data:image"), "session status leaked image data");
  assert(!serialized.includes("data:audio"), "session status leaked audio data");
  assert(!serialized.includes("recentframes"), "session status leaked frame cache");
  assert(!serialized.includes("recentmessages"), "session status leaked message cache");
}

async function runCostGuardChecks() {
  const session = await createSession();
  const socket = new WebSocket(`ws://127.0.0.1:${port}${session.wsPath}`);
  const errors = [];

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("cost guard timeout")), 8000);

    socket.on("open", () => {
      socket.send(JSON.stringify(createFrameMessage(120)));
      socket.send(JSON.stringify(createFrameMessage(120)));
      socket.send(JSON.stringify(createFrameMessage(201 * 1024, createJpegDataUrl(201 * 1024))));
      socket.send(JSON.stringify({ type: "text", text: "x".repeat(530 * 1024) }));
    });

    socket.on("message", (payload) => {
      const message = JSON.parse(payload.toString());
      if (message.type !== "error") return;

      errors.push(message.message);
      if (errors.length >= 3) {
        clearTimeout(timeout);
        resolve();
      }
    });

    socket.on("error", reject);
  });

  socket.close();
  await endSession(session.sessionId);

  assert(errors.some((error) => error.includes("频繁")), "frame rate guard did not trigger");
  assert(errors.some((error) => error.includes("200KB")), "single frame size guard did not trigger");
  assert(errors.some((error) => error.includes("512KB")), "message size guard did not trigger");
}

async function assertForgedFrameBytesRejected() {
  const session = await createSession();
  const socket = new WebSocket(`ws://127.0.0.1:${port}${session.wsPath}`);

  const error = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("forged frame timeout")), 8000);

    socket.on("open", () => {
      socket.send(JSON.stringify(createFrameMessage(120, createJpegDataUrl(201 * 1024))));
    });

    socket.on("message", (payload) => {
      const message = JSON.parse(payload.toString());
      if (message.type === "error") {
        clearTimeout(timeout);
        resolve(message.message);
      }
    });

    socket.on("error", reject);
  });

  socket.close();
  await endSession(session.sessionId);

  assert(String(error).includes("200KB"), "forged frame bytes bypassed server size guard");
}

async function assertForgedAudioBytesRejected() {
  const session = await createSession();
  const socket = new WebSocket(`ws://127.0.0.1:${port}${session.wsPath}`);

  const error = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("forged audio timeout")), 8000);

    socket.on("open", () => {
      socket.send(JSON.stringify({
        type: "audio",
        mimeType: "audio/webm",
        durationMs: 1000,
        bytes: 1,
        dataUrl: "data:audio/webm;base64,AAAA"
      }));
    });

    socket.on("message", (payload) => {
      const message = JSON.parse(payload.toString());
      if (message.type === "error") {
        clearTimeout(timeout);
        resolve(message.message);
      }
    });

    socket.on("error", reject);
  });

  socket.close();
  await endSession(session.sessionId);

  assert(String(error).includes("invalid audio chunk"), "forged audio bytes were accepted");
}

async function assertEndedSessionRejectsMessages() {
  const session = await createSession();
  await endSession(session.sessionId);

  const socket = new WebSocket(`ws://127.0.0.1:${port}${session.wsPath}`);
  const result = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("ended session timeout")), 5000);

    socket.on("open", () => {
      socket.send(JSON.stringify({ type: "text", text: "should be rejected" }));
    });

    socket.on("message", (payload) => {
      const message = JSON.parse(payload.toString());
      if (message.type === "session.ended" || message.type === "error") {
        clearTimeout(timeout);
        resolve(message.type);
      }
    });

    socket.on("close", () => {
      clearTimeout(timeout);
      resolve("closed");
    });

    socket.on("error", reject);
  });

  socket.close();
  assert(
    result === "session.ended" || result === "closed" || result === "error",
    "ended session accepted a new message"
  );
}

async function assertMalformedClientMessagesRejected() {
  const session = await createSession();
  const socket = new WebSocket(`ws://127.0.0.1:${port}${session.wsPath}`);
  const errors = [];

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("malformed message timeout")), 8000);

    socket.on("open", () => {
      socket.send(JSON.stringify({ type: "unknown", text: "bad" }));
      socket.send(JSON.stringify({ type: "text" }));
      socket.send(JSON.stringify({
        type: "frame",
        mimeType: "image/jpeg",
        width: 0,
        height: 2,
        bytes: 120,
        dataUrl: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2w=="
      }));
      socket.send(JSON.stringify({
        type: "audio",
        mimeType: "text/plain",
        durationMs: 1000,
        bytes: 3,
        dataUrl: "data:text/plain;base64,AAAA"
      }));
      socket.send(JSON.stringify({
        type: "audio",
        mimeType: "audio/webm",
        durationMs: 6000,
        bytes: 3,
        dataUrl: "data:audio/webm;base64,AAAA"
      }));
    });

    socket.on("message", (payload) => {
      const message = JSON.parse(payload.toString());
      if (message.type !== "error") return;

      errors.push(message.message);
      if (errors.length >= 5) {
        clearTimeout(timeout);
        resolve();
      }
    });

    socket.on("error", reject);
  });

  socket.close();
  await endSession(session.sessionId);

  assert(
    errors.every((error) => error.includes("invalid client message")),
    "malformed client messages were not rejected consistently"
  );
}

async function assertTextMediaPayloadsAreRedacted() {
  const session = await createSession();
  const socket = new WebSocket(`ws://127.0.0.1:${port}${session.wsPath}`);
  const leakedDataUrl = `data:image/jpeg;base64,${"C".repeat(160)}`;
  const leakedToken = "Bearer text-secret-token";

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("text redaction timeout")), 8000);

    socket.on("open", () => {
      socket.send(JSON.stringify({
        type: "text",
        text: `please inspect ${leakedDataUrl} and ${leakedToken}`
      }));
    });

    socket.on("message", (payload) => {
      const message = JSON.parse(payload.toString());
      if (message.type === "ai.done") {
        clearTimeout(timeout);
        resolve();
      }
      if (message.type === "error") {
        clearTimeout(timeout);
        reject(new Error(message.message));
      }
    });

    socket.on("error", reject);
  });

  socket.close();
  await endSession(session.sessionId);

  const db = new DatabaseSync(databasePath);
  const rows = db.prepare("SELECT text FROM messages WHERE session_id = ?").all(session.sessionId);
  db.close();
  const serialized = JSON.stringify(rows);

  assert(serialized.includes("[redacted-data-url]"), "text media data URL was not redacted");
  assert(serialized.includes("Bearer [redacted]"), "text token was not redacted");
  assert(!serialized.includes("data:image"), "text media data URL leaked into database");
  assert(!serialized.includes("text-secret-token"), "text token leaked into database");
  assert(!serialized.includes("C".repeat(120)), "long base64 text leaked into database");
}

function createFrameMessage(bytes, dataUrl = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2w==") {
  return {
    type: "frame",
    mimeType: "image/jpeg",
    width: 2,
    height: 2,
    bytes,
    dataUrl
  };
}

function createJpegDataUrl(decodedBytes) {
  return `data:image/jpeg;base64,${Buffer.alloc(decodedBytes).toString("base64")}`;
}

function assertPrivateSqliteSchema() {
  const db = new DatabaseSync(databasePath);
  const rows = db.prepare(
    "SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'"
  ).all();
  const tableNames = rows.map((row) => row.name).sort();
  const schema = JSON.stringify(rows).toLowerCase();
  assert(
    JSON.stringify(tableNames) === JSON.stringify(["messages", "sessions", "usage_events"]),
    `unexpected SQLite tables: ${tableNames.join(", ")}`
  );
  assert(!schema.includes("base64"), "schema contains base64");
  assert(!schema.includes("dataurl"), "schema contains dataUrl");
  assert(!schema.includes("audio_blob"), "schema contains audio blob");
  db.close();
}

function assertUsageEventsRecorded() {
  const db = new DatabaseSync(databasePath);
  const row = db.prepare("SELECT COUNT(*) AS count FROM usage_events").get();
  db.close();
  assert(Number(row.count) > 0, "usage_events did not record short session usage");
}

async function assertSessionEndClearsVisionCache() {
  const { SessionStore } = await import("../server/dist/sessions/sessionStore.js");
  const store = new SessionStore();
  const session = store.create(60_000);
  session.recentFrames.push({
    receivedAt: Date.now(),
    mimeType: "image/jpeg",
    width: 2,
    height: 2,
    bytes: 120,
    dataUrl: "data:image/jpeg;base64,AAAA"
  });

  store.end(session.id);
  assert(session.recentFrames.length === 0, "ended session retained cached vision frames");
}

function assertFrameSamplerCadence() {
  const source = readFileSync("frontend/src/features/media/frameSampler.ts", "utf8");
  const maxFramesInTenMinutes = Math.floor((10 * 60 * 1000) / 1500);
  const captureCallCount = source.match(/void capture\(\);/g)?.length ?? 0;

  assert(maxFramesInTenMinutes === 400, "default frame cadence does not cap at 400 frames");
  assert(captureCallCount === 1, "frame sampler sends an immediate extra frame");
  assert(source.includes("intervalMs = 1500"), "frame sampler default interval changed");
  assert(source.includes("maxWidth = 512"), "frame sampler default width changed");
}

async function assertShortSessionsExpire() {
  const expiryPort = 4101;
  const expiryDatabasePath = "./server/data/expiry-smoke.sqlite";
  const expiryBase = `http://localhost:${expiryPort}`;
  rmSync(expiryDatabasePath, { force: true });

  const expiryServer = spawn("node", ["server/dist/index.js"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(expiryPort),
      HOST: "127.0.0.1",
      AI_PROVIDER: "mock",
      DATABASE_PATH: expiryDatabasePath,
      MAX_SESSION_MINUTES: "0.001",
      USAGE_PUSH_INTERVAL_MS: "50"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  let expiryStderr = "";
  expiryServer.stderr.on("data", (chunk) => {
    expiryStderr += chunk.toString();
  });
  expiryServer.stdout.on("data", () => undefined);

  try {
    await waitForServerHealth(expiryBase, () => expiryStderr);

    const idleSession = await createSessionAt(expiryBase);
    await wait(100);
    const status = await getSessionAt(expiryBase, idleSession.sessionId);
    assert(status.status === "ended", "expired idle session did not become ended on status query");

    const realtimeSession = await createSessionAt(expiryBase);
    const socket = new WebSocket(`ws://127.0.0.1:${expiryPort}${realtimeSession.wsPath}`);
    const endedReason = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("session expiry timeout")), 5000);

      socket.on("message", (payload) => {
        const message = JSON.parse(payload.toString());
        if (message.type === "session.ended") {
          clearTimeout(timeout);
          resolve(message.reason);
        }
      });

      socket.on("error", reject);
    });

    socket.close();
    assert(String(endedReason).includes("最长时长"), "realtime session did not end because of expiry");
  } finally {
    expiryServer.kill();
  }
}

async function createSessionAt(baseUrl) {
  const response = await fetch(`${baseUrl}/api/sessions`, { method: "POST" });
  assert(response.ok, `create session failed at ${baseUrl}: ${response.status}`);
  return response.json();
}

async function getSessionAt(baseUrl, sessionId) {
  const response = await fetch(`${baseUrl}/api/sessions/${sessionId}`);
  assert(response.ok, `get session failed at ${baseUrl}: ${response.status}`);
  return response.json();
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
