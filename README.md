# AI 视觉对话助手

一个面向比赛演示的 Web Demo：浏览器采集摄像头和麦克风，端侧抽帧压缩后通过 WebSocket 发送到后端，后端用统一 Provider 接口返回 AI 文本回复，并记录会话用量。

## HR 快速运行

HR 在 Windows 电脑上本地运行 demo 时，请优先阅读 [START_HERE_HR.md](START_HERE_HR.md)。

最短命令链路：

```bash
npm ci
npm run hr:check
npm run hr:start
```

默认使用 `AI_PROVIDER=mock`，不需要配置 OpenAI API Key。

## 功能状态

| 模块 | 状态 | 说明 |
| --- | --- | --- |
| 前端单页 UI | 已实现 | 视频预览、麦克风状态、对话列表、控制栏 |
| 摄像头/麦克风采集 | 已实现 | 点击开始后授权，结束时释放设备 |
| 端侧抽帧压缩 | 已实现 | 默认 1.5 秒一帧、512px 宽、JPEG 压缩；10 分钟最多 400 帧 |
| 实时网关 | 已实现 | `POST /api/sessions` 创建会话，WebSocket 收发消息 |
| 语音输入 | 已实现基础版 | 支持 Web Speech API 时转写为文本；不支持时用 VAD 触发兜底回应 |
| AI Provider | 已实现基础版 | 默认 `mock` 可离线演示，`openai` 可接真实视觉模型 |
| 上下文管理 | 已实现基础版 | 内存裁剪最近 8 条文本消息，缓存最近 3 帧视觉帧 |
| 日志监控 | 已实现基础版 | 服务端输出结构化 metrics 日志，包含延迟、用量、错误 |
| 成本与隐私控制 | 已实现基础版 | 限制消息大小、帧率、会话时长；SQLite 不保存原始媒体 |
| 设计文档 | 已实现 | 见 `outputs/AI视觉对话助手-设计文档.md` |

## 启动

```bash
npm install
npm run dev
```

默认地址：

- 前端：http://localhost:5173
- 后端：http://localhost:4000
- 健康检查：http://localhost:4000/health

也可以分开启动：

```bash
npm run dev:server
npm run dev:frontend
```

## 环境变量

复制示例文件：

```bash
copy server\.env.example server\.env
copy frontend\.env.example frontend\.env
```

默认 `AI_PROVIDER=mock`，不需要模型 Key。要接真实视觉模型：

```env
AI_PROVIDER=openai
OPENAI_API_KEY=你的后端模型 Key
OPENAI_MODEL=gpt-4.1-mini
```

模型 Key 只在 `server/.env` 中配置，前端不会读取。

前端只需要配置后端地址：

```env
VITE_API_BASE=http://localhost:4000
```

## 演示流程

1. 打开前端页面。
2. 点击“开始”，授权摄像头和麦克风。
3. 页面显示实时画面与麦克风音量。
4. 输入“画面里有什么？”并发送。
5. 后端 provider 返回流式文本回复，浏览器用 TTS 播放 AI 文本。
6. 支持 Web Speech API 的浏览器会把语音转成文本并发送；不支持时，麦克风检测到持续说话会触发一次基于当前画面的简短回应。
7. AI 语音播放时可点击“打断”停止播放。
8. 点击“结束”，浏览器释放摄像头和麦克风，后端停止会话。

拒绝摄像头或麦克风授权时，页面显示错误提示，不会创建后端会话或打开 WebSocket。
如果媒体授权成功但后端会话创建失败，页面会显示错误并释放摄像头和麦克风。

真实视觉验收时，配置 `AI_PROVIDER=openai` 后使用对话框上方的 3 个快捷问题：

- 画面里有什么？
- 主要颜色是什么？
- 我手里拿着什么？

三题至少答对两题即可满足当前比赛验收标准。
快捷问题会在“视觉帧已就绪”后启用，避免首帧尚未发送时误测。

现场记录表见 `outputs/AI视觉对话助手-现场验收清单.md`。

## API 摘要

```bash
curl http://localhost:4000/health
curl -X POST http://localhost:4000/api/sessions
curl http://localhost:4000/api/sessions/<sessionId>
curl -X POST http://localhost:4000/api/sessions/<sessionId>/end
```

WebSocket 地址由创建会话接口返回，例如 `/realtime?sessionId=...`。
健康检查返回当前 `provider` 模式用于现场确认，不返回 `OPENAI_API_KEY` 或其他密钥值。
会话查询接口只返回状态、时间和 usage，不返回媒体缓存或 data URL。

## 验证命令

```bash
npm run typecheck
npm run build
npm run docs:smoke
npm run frontend:smoke
npm run browser:smoke
npm run provider:smoke
npm run startup:smoke
npm run smoke
npm run verify
```

`npm run docs:smoke` 会检查 README、设计文档和现场验收清单包含架构图、用户故事状态、成本策略采用/未采用、运行说明和真实视觉验收边界。
`npm run frontend:smoke` 会检查构建后的前端入口、JS/CSS 资源和首屏关键演示文案。
`npm run browser:smoke` 会临时启动本地 mock 后端和 Vite 前端，用 Playwright CLI 打开真实浏览器，检查首屏 3 秒内可见、后端模式显示为 `mock`、关键面板存在、控制台无 error，并模拟拒绝摄像头/麦克风授权时不会创建后端会话或打开业务 WebSocket。该命令可能首次下载 Playwright CLI，因此不放入默认 `verify`。
`npm run provider:smoke` 会离线 mock OpenAI HTTP 响应，验证真实 provider 适配器的请求体、视觉输入、流式错误处理和错误脱敏。
`npm run startup:smoke` 会启动根目录 `npm run dev`，验证后端健康检查和前端开发页能在本地返回。
`npm run smoke` 会启动已构建后端，验证健康检查、会话创建、WebSocket 收发、图片帧、音频片段、usage 定时推送、会话到期结束、手动结束会话和 SQLite 隐私 schema。

真实模型预检：

```bash
npm run check:openai
```

该命令会读取 `server/.env` 或当前环境变量中的 `OPENAI_API_KEY`，用脚本生成的红、绿、蓝三张 PNG 验证 OpenAI 视觉输入，至少答对 2/3 才通过。如果没有配置 Key，默认跳过；在 CI 中可设置 `REQUIRE_OPENAI_CHECK=1` 让缺少 Key 变成失败。

## 隐私策略

- 前端只发送压缩图片帧，不上传完整视频流。
- 抽帧从第一个 1.5 秒周期开始发送，不额外发送立即帧，避免 10 分钟超过 400 帧。
- 后端只在内存中缓存最近 3 帧压缩图片和最近 8 条文本上下文；会话结束时清空内存视觉缓存，不把原始音频、图片、视频 base64 写入数据库或日志。
- 音频片段按实际 data URL 字节数校验，并限制单片段声明时长，避免异常客户端污染 usage。
- 文本消息中夹带的媒体 data URL、长 base64 片段和 Bearer token 会在入库和进入上下文前脱敏。
- SQLite 仅记录会话、文本消息、用量事件和估算成本字段。
- 服务端 metrics 日志只记录事件名、延迟、计数和估算成本，不记录媒体内容。
- 默认每 10 秒推送并记录一次 usage；测试可通过 `USAGE_PUSH_INTERVAL_MS` 缩短间隔。
