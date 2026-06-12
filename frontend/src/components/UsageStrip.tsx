import type { UsageSnapshot } from "../features/session/types";

interface UsageStripProps {
  usage: UsageSnapshot | null;
  sessionId: string | null;
}

export const UsageStrip = ({ usage, sessionId }: UsageStripProps) => (
  <div className="usageStrip">
    <span>Session {sessionId ? sessionId.slice(0, 8) : "未创建"}</span>
    <span>图片 {usage?.frameCount ?? 0}</span>
    <span>音频 {usage?.audioSeconds ?? 0}s</span>
    <span>消息 {usage?.messageCount ?? 0}</span>
    <span>${(usage?.estimatedCostUsd ?? 0).toFixed(5)}</span>
  </div>
);
