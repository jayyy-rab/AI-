import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as wait } from "node:timers/promises";

const serverPort = 4200;
const frontendPort = 5174;
const serverBase = `http://127.0.0.1:${serverPort}`;
const frontendBase = `http://127.0.0.1:${frontendPort}`;
const startedAt = Date.now();
const nodeCommand = "node";
const npxCommand = "npx";
const tsxCli = join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs");
const viteCli = join(process.cwd(), "node_modules", "vite", "bin", "vite.js");
const browserSession = `ai-vision-browser-smoke-${Date.now()}`;
const databasePath = join(process.cwd(), "server", "data", "browser-smoke.sqlite");
const tempDir = mkdtempSync(join(tmpdir(), "ai-vision-browser-smoke-"));
const pageCheckPath = join(tempDir, "page-check.js");
const permissionDeniedCheckPath = join(tempDir, "permission-denied-check.js");
const mediaSuccessCheckPath = join(tempDir, "media-success-check.js");
let smokePassed = false;

assert(existsSync(tsxCli), "tsx CLI is missing; run npm install first");
assert(existsSync(viteCli), "vite CLI is missing; run npm install first");
rmSync(databasePath, { force: true });
writeFileSync(
  pageCheckPath,
  `async page => {
    await page.waitForSelector(".appShell", { timeout: 3000 });
    await page.waitForFunction(() => document.body.innerText.includes("mock"), null, { timeout: 3000 });
    return await page.evaluate(() => JSON.stringify({
      title: document.querySelector("h1")?.innerText,
      hasVideoPane: Boolean(document.querySelector(".videoPane")),
      hasConversation: Boolean(document.querySelector(".conversationPane")),
      hasUsage: Boolean(document.querySelector(".usageStrip")),
      text: document.body.innerText,
      buttons: Array.from(document.querySelectorAll("button")).map((button) => ({
        text: button.innerText.trim(),
        disabled: button.disabled
      }))
    }));
  }`
);
writeFileSync(
  permissionDeniedCheckPath,
  `async page => {
    await page.goto("about:blank");
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "mediaDevices", {
        configurable: true,
        value: {
          getUserMedia: async () => {
            throw new DOMException("Permission denied by browser smoke", "NotAllowedError");
          }
        }
      });

      const originalFetch = window.fetch.bind(window);
      window.__sessionRequests = 0;
      window.fetch = (input, init) => {
        const url = typeof input === "string" ? input : input?.url ?? "";
        if (url.includes("/api/sessions")) window.__sessionRequests += 1;
        return originalFetch(input, init);
      };

      const OriginalWebSocket = window.WebSocket;
      window.__webSocketCreations = 0;
      window.WebSocket = function (...args) {
        const url = String(args[0] ?? "");
        if (url.includes("/realtime")) window.__webSocketCreations += 1;
        return new OriginalWebSocket(...args);
      };
      Object.setPrototypeOf(window.WebSocket, OriginalWebSocket);
      window.WebSocket.prototype = OriginalWebSocket.prototype;
    });

    await page.goto("${frontendBase}");
    await page.waitForSelector(".appShell", { timeout: 3000 });
    await page.evaluate(() => {
      const startButton = Array.from(document.querySelectorAll("button"))
        .find((button) => !button.disabled);
      startButton?.click();
    });
    await page.waitForFunction(
      () => document.body.innerText.includes("Permission denied by browser smoke"),
      null,
      { timeout: 3000 }
    );

    return await page.evaluate(() => JSON.stringify({
      permissionErrorShown: document.body.innerText.includes("Permission denied by browser smoke"),
      sessionRequests: window.__sessionRequests,
      webSocketCreations: window.__webSocketCreations
    }));
  }`
);
writeFileSync(
  mediaSuccessCheckPath,
  `async page => {
    await page.goto("about:blank");
    await page.addInitScript(() => {
      window.__sessionRequests = 0;
      window.__webSocketCreations = 0;

      Object.defineProperty(navigator, "mediaDevices", {
        configurable: true,
        value: {
          getUserMedia: async () => {
            const canvas = document.createElement("canvas");
            canvas.width = 640;
            canvas.height = 480;
            const context = canvas.getContext("2d");
            let frame = 0;
            const draw = () => {
              frame += 1;
              context.fillStyle = frame % 2 === 0 ? "#0f766e" : "#2563eb";
              context.fillRect(0, 0, canvas.width, canvas.height);
              context.fillStyle = "#f8fafc";
              context.font = "42px sans-serif";
              context.fillText("AI Vision Smoke", 90, 240);
              window.__drawTimer = window.setTimeout(draw, 120);
            };
            draw();

            const videoStream = canvas.captureStream(10);
            const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
            const audioContext = new AudioContextCtor();
            const destination = audioContext.createMediaStreamDestination();
            const oscillator = audioContext.createOscillator();
            const gain = audioContext.createGain();
            gain.gain.value = 0.02;
            oscillator.frequency.value = 440;
            oscillator.connect(gain);
            gain.connect(destination);
            oscillator.start();

            return new MediaStream([
              ...videoStream.getVideoTracks(),
              ...destination.stream.getAudioTracks()
            ]);
          }
        }
      });

      const originalFetch = window.fetch.bind(window);
      window.fetch = (input, init) => {
        const url = typeof input === "string" ? input : input?.url ?? "";
        if (url.includes("/api/sessions")) window.__sessionRequests += 1;
        return originalFetch(input, init);
      };

      const OriginalWebSocket = window.WebSocket;
      window.WebSocket = function (...args) {
        const url = String(args[0] ?? "");
        if (url.includes("/realtime")) window.__webSocketCreations += 1;
        return new OriginalWebSocket(...args);
      };
      Object.setPrototypeOf(window.WebSocket, OriginalWebSocket);
      window.WebSocket.prototype = OriginalWebSocket.prototype;
    });

    await page.goto("${frontendBase}");
    await page.waitForSelector(".appShell", { timeout: 3000 });
    await page.evaluate(() => {
      const startButton = Array.from(document.querySelectorAll("button"))
        .find((button) => !button.disabled);
      startButton?.click();
    });
    await page.waitForFunction(
      () => window.__sessionRequests === 1 && window.__webSocketCreations === 1,
      null,
      { timeout: 5000 }
    );
    await page.waitForFunction(
      () => Array.from(document.querySelectorAll(".promptChips button")).some((button) => !button.disabled),
      null,
      { timeout: 6000 }
    );

    await page.locator(".composer input").fill("what can you see in the image?");
    await page.keyboard.press("Enter");
    await page.waitForFunction(
      () => document.body.innerText.includes("Mock provider received"),
      null,
      { timeout: 5000 }
    );

    return await page.evaluate(() => JSON.stringify({
      sessionRequests: window.__sessionRequests,
      webSocketCreations: window.__webSocketCreations,
      visionPromptEnabled: Array.from(document.querySelectorAll(".promptChips button")).some((button) => !button.disabled),
      mockAnswerShown: document.body.innerText.includes("Mock provider received")
    }));
  }`
);

const server = spawn(nodeCommand, [tsxCli, "src/index.ts"], {
  cwd: join(process.cwd(), "server"),
  env: childEnv({
    PORT: String(serverPort),
    HOST: "127.0.0.1",
    AI_PROVIDER: "mock",
    DATABASE_PATH: "./data/browser-smoke.sqlite"
  }),
  stdio: ["ignore", "pipe", "pipe"]
});

const frontend = spawn(
  nodeCommand,
  [viteCli, "--host", "127.0.0.1", "--port", String(frontendPort), "--strictPort"],
  {
    cwd: join(process.cwd(), "frontend"),
    env: childEnv({
      VITE_API_BASE: serverBase
    }),
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
  assert(health.ok === true, "server health did not return ok");
  assert(health.provider === "mock", "browser smoke must use mock provider");

  await waitForText(frontendBase, 5 * 60 * 1000, 3000);

  await runPlaywright(["open", frontendBase]);
  const pageResult = await runPlaywright([
    "run-code",
    "--filename",
    pageCheckPath,
    "--raw"
  ]);
  const permissionDeniedResult = await runPlaywright([
    "run-code",
    "--filename",
    permissionDeniedCheckPath,
    "--raw"
  ]);
  const consoleErrors = await runPlaywright(["console", "error", "--raw"]);

  const page = parseMaybeQuotedJson(pageResult.stdout.trim());
  const permissionDenied = parseMaybeQuotedJson(permissionDeniedResult.stdout.trim());
  assert(page.title === "AI 视觉对话助手", "browser page title is wrong");
  assert(page.hasVideoPane === true, "browser page is missing video panel");
  assert(page.hasConversation === true, "browser page is missing conversation panel");
  assert(page.hasUsage === true, "browser page is missing usage strip");
  assert(page.text.includes("后端模式：mock"), "browser page did not show mock provider mode");
  assert(page.buttons.some((button) => button.text === "开始" && button.disabled === false), "start button is not enabled");
  assert(permissionDenied.permissionErrorShown === true, "permission denial did not show an error");
  assert(permissionDenied.sessionRequests === 0, "permission denial created a backend session");
  assert(permissionDenied.webSocketCreations === 0, "permission denial opened a WebSocket");
  assert(consoleErrors.stdout.includes("Errors: 0"), `browser console errors found: ${consoleErrors.stdout}`);

  smokePassed = true;
  console.log(`browser smoke ok (${Date.now() - startedAt}ms)`);
} finally {
  await runPlaywright(["close"]).catch(() => undefined);
  await stopChild(frontend);
  await stopChild(server);
  removeQuietly(tempDir, { recursive: true, force: true });
  if (smokePassed) {
    removeQuietly(join(process.cwd(), ".playwright-cli"), { recursive: true, force: true });
    removeQuietly(databasePath, { force: true });
  }
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

async function runPlaywright(args) {
  const playwrightArgs = ["--yes", "--package", "@playwright/cli", "playwright-cli", ...args];
  const command = process.platform === "win32" ? "cmd.exe" : npxCommand;
  const commandArgs = process.platform === "win32"
    ? ["/d", "/s", "/c", npxCommand, ...playwrightArgs]
    : playwrightArgs;
  const child = spawn(
    command,
    commandArgs,
    {
      env: childEnv({
        PLAYWRIGHT_CLI_SESSION: browserSession
      }),
      stdio: ["ignore", "pipe", "pipe"]
    }
  );

  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => {
    stdout += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  const exitCode = await new Promise((resolve) => {
    child.on("close", resolve);
  });

  if (exitCode !== 0) {
    throw new Error(`playwright command failed: ${args.join(" ")}\n${stdout}\n${stderr}`);
  }

  return { stdout, stderr };
}

function parseMaybeQuotedJson(value) {
  const parsed = JSON.parse(value);
  return typeof parsed === "string" ? JSON.parse(parsed) : parsed;
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

async function stopChild(child) {
  if (child.exitCode !== null) return;

  await new Promise((resolve) => {
    const timeout = setTimeout(resolve, 1500);
    child.once("close", () => {
      clearTimeout(timeout);
      resolve();
    });
    child.kill();
  });
}

function childEnv(extra = {}) {
  const env = { ...process.env, ...extra };
  if (process.platform !== "win32") return env;

  const pathValue = env.Path ?? env.PATH ?? env.path;
  for (const key of Object.keys(env)) {
    if (key.toLowerCase() === "path") delete env[key];
  }
  if (pathValue) env.Path = pathValue;

  return env;
}

function removeQuietly(path, options) {
  try {
    rmSync(path, options);
  } catch {
    // Browser smoke artifacts are ignored and should not make a passed smoke fail.
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
