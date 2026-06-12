import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), "utf8");

const readme = read("README.md");
const designPath = "outputs/AI视觉对话助手-设计文档.md";
const checklistPath = "outputs/AI视觉对话助手-现场验收清单.md";

assert(existsSync(join(root, designPath)), "design document is missing");
assert(existsSync(join(root, checklistPath)), "field acceptance checklist is missing");

const design = read(designPath);
const checklist = read(checklistPath);

for (const text of [
  "```mermaid",
  "flowchart TB",
  "前端 frontend",
  "后端 server",
  "云端 AI",
  "用户故事计划与完成对照",
  "成本策略想到与采用对照",
  "运行说明",
  "验收说明",
  "未实现范围"
]) {
  assert(design.includes(text), `design document missing section or architecture text: ${text}`);
}

for (const story of [
  "用户可以启动 Web Demo",
  "用户可以授权摄像头和麦克风",
  "用户可以完成一轮 mock 对话",
  "用户可以问“画面里有什么”",
  "评委可以查看用量"
]) {
  assert(design.includes(story), `design document missing user story: ${story}`);
}

for (const status of ["已完成", "已完成基础版"]) {
  assert(design.includes(status), `design document missing story status: ${status}`);
}

for (const strategy of [
  "| 不上传完整视频流 | 采用 |",
  "| 默认 1 帧/1.5 秒 | 采用 |",
  "| 数据库不保存原始媒体 | 采用 |",
  "| 文本夹带媒体脱敏 | 采用 |",
  "| 真实计费套餐 | 未采用 |",
  "| 复杂模型路由 | 未采用 |"
]) {
  assert(design.includes(strategy), `design document missing cost strategy row: ${strategy}`);
}

for (const text of [
  "npm install",
  "npm run dev",
  "AI_PROVIDER=openai",
  "OPENAI_API_KEY",
  "curl http://localhost:4000/health",
  "npm run verify",
  "npm run browser:smoke",
  "npm run check:openai"
]) {
  assert(readme.includes(text), `README missing run or verification instruction: ${text}`);
}

for (const text of ["npm run browser:smoke"]) {
  assert(design.includes(text), `design document missing browser verification instruction: ${text}`);
  assert(checklist.includes(text), `field checklist missing browser verification item: ${text}`);
}
for (const text of ["业务 WebSocket"]) {
  assert(readme.includes(text), `README missing browser permission denial scope: ${text}`);
  assert(design.includes(text), `design document missing browser permission denial scope: ${text}`);
}

assert(
  readme.includes("3 题至少答对 2 题") || readme.includes("三题至少答对两题"),
  "README missing 2/3 visual acceptance wording"
);

for (const text of [
  "配置 `AI_PROVIDER=openai`",
  "如果没有配置 Key，默认跳过",
  "不把原始音频、图片、视频 base64 写入数据库或日志"
]) {
  assert(readme.includes(text), `README missing honest acceptance/privacy wording: ${text}`);
}

for (const text of [
  "视觉理解 2/3 验收",
  "画面里有什么？",
  "主要颜色是什么？",
  "我手里拿着什么？",
  "SQLite 只包含 `sessions/messages/usage_events`",
  "服务端日志不输出原始音频、图片、视频 base64"
]) {
  assert(checklist.includes(text), `field checklist missing acceptance item: ${text}`);
}

assert(
  design.includes("真实视觉问答需要配置后端 `OPENAI_API_KEY`"),
  "design document must not imply real vision is complete without an API key"
);
assert(
  !design.includes("真实视觉问答已完成") && !readme.includes("真实视觉问答已完成"),
  "documents overstate real vision completion"
);

console.log("docs smoke ok");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
