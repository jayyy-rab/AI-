import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync } from "node:fs";
import net from "node:net";
import { join } from "node:path";

const requiredNodeMajor = 24;
const requiredExamples = [
  { example: join("server", ".env.example"), target: join("server", ".env") },
  { example: join("frontend", ".env.example"), target: join("frontend", ".env") }
];
const requiredPorts = [
  { port: 4000, label: "后端" },
  { port: 5173, label: "前端" }
];

const failures = [];
const notes = [];

checkNodeVersion();
checkNpm();
checkEnvExamples();

if (failures.length === 0) {
  copyMissingEnvFiles();
  await checkPorts();
}

if (failures.length > 0) {
  console.error("HR 本地运行前置检查失败：");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("HR 本地运行前置检查通过：");
for (const note of notes) console.log(`- ${note}`);

function checkNodeVersion() {
  const [majorText] = process.versions.node.split(".");
  const major = Number(majorText);

  if (!Number.isInteger(major) || major < requiredNodeMajor) {
    failures.push(`当前 Node 版本为 v${process.versions.node}，请安装 Node.js 24 LTS 后重试。`);
    return;
  }

  notes.push(`Node v${process.versions.node}`);
}

function checkNpm() {
  const command = process.platform === "win32" ? "cmd.exe" : "npm";
  const args = process.platform === "win32" ? ["/d", "/s", "/c", "npm", "--version"] : ["--version"];
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });

  if (result.error || result.status !== 0) {
    failures.push("未找到可用的 npm，请确认 Node.js 24 LTS 已正确安装并重新打开终端。");
    return;
  }

  notes.push(`npm ${result.stdout.trim()}`);
}

function checkEnvExamples() {
  for (const { example } of requiredExamples) {
    if (!existsSync(example)) {
      failures.push(`缺少 ${example}，无法生成本地 .env 文件。`);
    }
  }
}

function copyMissingEnvFiles() {
  for (const { example, target } of requiredExamples) {
    if (existsSync(target)) {
      notes.push(`${target} 已存在，未覆盖`);
      continue;
    }

    copyFileSync(example, target);
    notes.push(`已从 ${example} 创建 ${target}`);
  }
}

async function checkPorts() {
  const busyPorts = [];

  for (const { port, label } of requiredPorts) {
    const isAvailable = await canListen(port);
    if (isAvailable) {
      notes.push(`${label}端口 ${port} 可用`);
    } else {
      busyPorts.push(`${label}端口 ${port}`);
    }
  }

  if (busyPorts.length > 0) {
    failures.push(`${busyPorts.join("、")} 已被占用，请关闭占用端口的程序后重试。`);
  }
}

function canListen(port) {
  return new Promise((resolve) => {
    const server = net.createServer();

    server.once("error", () => {
      resolve(false);
    });

    server.once("listening", () => {
      server.close(() => {
        resolve(true);
      });
    });

    server.listen({ host: "0.0.0.0", port });
  });
}
