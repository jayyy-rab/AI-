export type SessionStatus = "active" | "paused" | "ended";

export interface SessionRecord {
  id: string;
  createdAt: number;
  expiresAt: number;
  status: SessionStatus;
  frameCount: number;
  recentFrames: CachedFrame[];
  recentMessages: ConversationTurn[];
  audioMs: number;
  messageCount: number;
  estimatedCostUsd: number;
  lastFrameAt: number;
}

export interface CachedFrame {
  receivedAt: number;
  mimeType: "image/jpeg";
  width: number;
  height: number;
  bytes: number;
  dataUrl: string;
}

export interface ConversationTurn {
  role: "user" | "assistant";
  text: string;
  createdAt: number;
}

export type ClientMessage =
  | { type: "control"; action: "start" | "pause" | "resume" | "end" }
  | { type: "text"; text: string }
  | {
      type: "frame";
      mimeType: "image/jpeg";
      width: number;
      height: number;
      bytes: number;
      dataUrl: string;
    }
  | {
      type: "audio";
      mimeType: string;
      durationMs: number;
      bytes: number;
      dataUrl: string;
    };

export type ServerMessage =
  | { type: "session.started"; sessionId: string; expiresAt: number }
  | { type: "session.paused" }
  | { type: "session.resumed" }
  | { type: "session.ended"; reason: string }
  | { type: "ai.delta"; messageId: string; text: string }
  | { type: "ai.done"; messageId: string }
  | { type: "speech.playing"; messageId: string }
  | { type: "usage"; usage: UsageSnapshot }
  | { type: "error"; message: string };

export interface UsageSnapshot {
  frameCount: number;
  audioSeconds: number;
  messageCount: number;
  estimatedCostUsd: number;
  expiresAt: number;
}
