import { config } from "../config.js";
import type { SessionRecord } from "../types.js";

export class CostController {
  validateSession(session: SessionRecord): string | null {
    if (session.status === "ended") return "会话已结束";
    if (Date.now() > session.expiresAt) return "会话已超过最长时长";
    return null;
  }

  validateMessageSize(rawBytes: number): string | null {
    return rawBytes > config.maxMessageBytes ? "消息超过 512KB 限制" : null;
  }

  registerFrame(session: SessionRecord, bytes: number): string | null {
    const now = Date.now();
    if (bytes > 200 * 1024) return "单帧超过 200KB 限制";
    if (session.lastFrameAt && now - session.lastFrameAt < config.frameIntervalMs) {
      return "图片发送过于频繁";
    }

    session.lastFrameAt = now;
    session.frameCount += 1;
    session.estimatedCostUsd += 0.00012;
    return null;
  }

  registerAudio(session: SessionRecord, durationMs: number): void {
    session.audioMs += Math.max(0, durationMs);
    session.estimatedCostUsd += (durationMs / 1000) * 0.00002;
  }

  registerTextMessage(session: SessionRecord): void {
    session.messageCount += 1;
    session.estimatedCostUsd += 0.00005;
  }
}
