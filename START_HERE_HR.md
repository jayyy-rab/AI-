# HR 快速运行指南

本指南用于在 Windows 电脑上用源码稳定运行 demo。默认使用 `mock` 模式，不需要配置 OpenAI API Key。

## 1. 安装 Node.js 24 LTS

打开 Node.js 官网安装 Node.js 24 LTS。安装完成后，重新打开 PowerShell，在项目根目录运行：

```bash
node -v
npm -v
```

`node -v` 应显示 `v24.x.x`。

## 2. 安装依赖

在项目根目录运行：

```bash
npm ci
```

## 3. 运行本地检查

```bash
npm run hr:check
```

该命令会检查 Node/npm、自动创建缺失的本地 `.env` 文件，并依次执行 `build`、`startup:smoke`、`browser:smoke`。

## 4. 启动 demo

```bash
npm run hr:start
```

该命令会先执行 `hr:setup`，确认端口 `4000` 和 `5173` 可用，再启动后端和前端开发服务。

## 5. 打开浏览器验收

打开：

```text
http://localhost:5173
```

页面显示“后端模式：mock”后，点击“开始”，并授权摄像头和麦克风。授权成功后即可完成一轮 mock 对话。

## 常见问题

### Node 版本过低

如果提示当前 Node 版本低于 24，请安装 Node.js 24 LTS，安装后重新打开 PowerShell 再运行命令。

### 端口被占用

如果提示 `4000` 或 `5173` 被占用，请关闭旧的项目终端、其他本地服务或占用端口的程序后重试。

可用下面命令查看占用进程：

```powershell
netstat -ano | findstr :4000
netstat -ano | findstr :5173
```

### 浏览器权限被拒

如果误点了拒绝摄像头或麦克风权限，请在浏览器地址栏左侧的网站权限里重新允许，然后刷新页面。

### 摄像头或麦克风不可用

确认 Windows 系统设置允许浏览器访问摄像头和麦克风，并关闭其他正在占用设备的软件。

### OpenAI API Key 非必需

HR 验收默认使用 `AI_PROVIDER=mock`，不需要配置 OpenAI API Key。只有要接真实视觉模型时，才需要在 `server/.env` 中配置 `OPENAI_API_KEY`。
