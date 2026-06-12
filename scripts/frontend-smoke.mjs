import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const distDir = join(process.cwd(), "frontend", "dist");
const indexPath = join(distDir, "index.html");
const assetsDir = join(distDir, "assets");

assert(existsSync(indexPath), "frontend dist index.html is missing; run npm run build first");
assert(existsSync(assetsDir), "frontend dist assets directory is missing");

const indexHtml = readFileSync(indexPath, "utf8");
const assetFiles = readdirSync(assetsDir);
const jsFiles = assetFiles.filter((file) => file.endsWith(".js"));
const cssFiles = assetFiles.filter((file) => file.endsWith(".css"));

assert(indexHtml.includes('id="root"'), "index.html is missing the React root node");
assert(indexHtml.includes('rel="icon"'), "index.html is missing an inline favicon");
assert(jsFiles.length > 0, "frontend dist is missing a JavaScript bundle");
assert(cssFiles.length > 0, "frontend dist is missing a CSS bundle");

for (const file of [...jsFiles, ...cssFiles]) {
  assert(indexHtml.includes(`/assets/${file}`), `index.html does not reference ${file}`);
}

const bundleText = jsFiles
  .map((file) => readFileSync(join(assetsDir, file), "utf8"))
  .join("\n");
const cssText = cssFiles
  .map((file) => readFileSync(join(assetsDir, file), "utf8"))
  .join("\n");
const sessionSource = readFileSync("frontend/src/features/session/useRealtimeSession.ts", "utf8");
const frameSamplerSource = readFileSync("frontend/src/features/media/frameSampler.ts", "utf8");
const audioChunkSenderSource = readFileSync("frontend/src/features/media/audioChunkSender.ts", "utf8");

for (const text of [
  "AI 视觉对话助手",
  "后端模式：",
  "检测中",
  "开始",
  "暂停",
  "继续",
  "结束",
  "画面里有什么？",
  "视觉帧已就绪",
  "等待首个视觉帧"
]) {
  assert(bundleText.includes(text), `frontend bundle is missing first-screen text: ${text}`);
}

for (const selector of [".appShell", ".workspace", ".controlBar", ".conversationPane"]) {
  assert(cssText.includes(selector), `frontend CSS is missing layout selector: ${selector}`);
}

for (const sourceText of [
  "assistantTextRef.current.clear()",
  "setMessages([])",
  "setUsage(null)",
  "setSessionId(null)",
  "connectionSeqRef",
  "isCurrentConnection(connectionSeq)",
  "connectionSeqRef.current += 1"
]) {
  assert(sessionSource.includes(sourceText), `session hook missing reset behavior: ${sourceText}`);
}

assert(
  countOccurrences(frameSamplerSource, "if (stopped) return") >= 2,
  "frame sampler can emit an async frame after cleanup"
);
assert(
  countOccurrences(audioChunkSenderSource, "if (stopped) return") >= 3,
  "audio chunk sender can emit an async chunk after cleanup"
);

console.log("frontend smoke ok");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function countOccurrences(text, needle) {
  return text.split(needle).length - 1;
}
