import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as wait } from "node:timers/promises";

const serverPort = 4300;
const frontendPort = 5173;
const serverBase = `http://127.0.0.1:${serverPort}`;
const frontendBase = `http://127.0.0.1:${frontendPort}`;
const startedAt = Date.now();
const nodeCommand = "node";
const tsxCli = join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs");
const viteCli = join(process.cwd(), "node_modules", "vite", "bin", "vite.js");

assert(existsSync(tsxCli), "tsx CLI is missing; run npm install first");
assert(existsSync(viteCli), "vite CLI is missing; run npm install first");

const server = spawn(nodeCommand, [tsxCli, "src/index.ts"], {
  cwd: join(process.cwd(), "server"),
  env: {
    ...process.env,
    PORT: String(serverPort),
    HOST: "127.0.0.1",
    AI_PROVIDER: "mock",
    DATABASE_PATH: "./data/startup-smoke.sqlite"
  },
  stdio: ["ignore", "pipe", "pipe"]
});

const frontend = spawn(
  nodeCommand,
  [viteCli, "--host", "127.0.0.1", "--port", String(frontendPort), "--strictPort"],
  {
    cwd: join(process.cwd(), "frontend"),
    env: {
      ...process.env,
      VITE_API_BASE: serverBase
    },
    stdio: ["ignore", "pipe", "pipe"]
  }
);

const logs = new Map([
  [server.pid, ""],
  [frontend.pid, ""]
]);

for (const child of [server, frontend]) {
  child.stdout.on("data", (chunk) => appendLog(child.pid, chunk));
  child.stderr.on("data", (chunk) => appendLog(child.pid, chunk));
}

try {
  const health = await waitForJson(`${serverBase}/health`, 5 * 60 * 1000);
  assert(health.ok === true, "dev server health did not return ok");
  assert(health.provider === "mock", "dev server did not use mock provider");

  const html = await waitForText(frontendBase, 5 * 60 * 1000, 3000);
  assert(html.includes('id="root"'), "frontend dev HTML is missing React root");
  const appSource = await waitForText(`${frontendBase}/src/app/App.tsx`, 5 * 60 * 1000, 3000);
  assert(appSource.includes("后端模式"), "frontend dev source is missing provider mode text");

  console.log(`startup smoke ok (${Date.now() - startedAt}ms)`);
} finally {
  stopChild(frontend);
  stopChild(server);
}

async function waitForJson(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    assertStillRunning();
    try {
      const response = await fetchWithTimeout(url, 3000);
      if (response.ok) return response.json();
    } catch {
      await wait(250);
    }
  }

  throw new Error(`timed out waiting for ${url}: ${recentLogs()}`);
}

async function waitForText(url, timeoutMs, requestTimeoutMs) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    assertStillRunning();
    try {
      const response = await fetchWithTimeout(url, requestTimeoutMs);
      if (response.ok) return response.text();
    } catch {
      await wait(250);
    }
  }

  throw new Error(`timed out waiting for ${url}: ${recentLogs()}`);
}

async function fetchWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function assertStillRunning() {
  for (const [name, child] of [
    ["server", server],
    ["frontend", frontend]
  ]) {
    if (child.exitCode !== null) {
      throw new Error(`${name} exited early with ${child.exitCode}: ${recentLogs()}`);
    }
  }
}

function appendLog(pid, chunk) {
  logs.set(pid, `${logs.get(pid) ?? ""}${chunk.toString()}`.slice(-1000));
}

function recentLogs() {
  return [...logs.values()].join("\n").slice(-2000);
}

function stopChild(child) {
  if (child.exitCode === null) child.kill();
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
