import { randomUUID } from "node:crypto";
import type { SessionRecord, UsageSnapshot } from "../types.js";

export class SessionStore {
  private readonly sessions = new Map<string, SessionRecord>();

  create(maxSessionMs: number): SessionRecord {
    const now = Date.now();
    const session: SessionRecord = {
      id: randomUUID(),
      createdAt: now,
      expiresAt: now + maxSessionMs,
      status: "active",
      frameCount: 0,
      recentFrames: [],
      recentMessages: [],
      audioMs: 0,
      messageCount: 0,
      estimatedCostUsd: 0,
      lastFrameAt: 0
    };
    this.sessions.set(session.id, session);
    return session;
  }

  get(sessionId: string): SessionRecord | undefined {
    return this.sessions.get(sessionId);
  }

  end(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.status = "ended";
      session.recentFrames = [];
    }
  }

  appendMessage(
    sessionId: string,
    role: "user" | "assistant",
    text: string,
    maxMessages: number
  ): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.recentMessages = [
      ...session.recentMessages,
      {
        role,
        text,
        createdAt: Date.now()
      }
    ].slice(-maxMessages);
  }

  toUsage(session: SessionRecord): UsageSnapshot {
    return {
      frameCount: session.frameCount,
      audioSeconds: Math.round(session.audioMs / 100) / 10,
      messageCount: session.messageCount,
      estimatedCostUsd: Number(session.estimatedCostUsd.toFixed(6)),
      expiresAt: session.expiresAt
    };
  }
}
