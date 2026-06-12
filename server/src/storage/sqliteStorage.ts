import { dirname, resolve } from "node:path";
import { mkdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import type { SessionRecord, UsageSnapshot } from "../types.js";

export class SqliteStorage {
  private readonly db: DatabaseSync;

  constructor(databasePath: string) {
    const absolutePath = resolve(databasePath);
    mkdirSync(dirname(absolutePath), { recursive: true });
    this.db = new DatabaseSync(absolutePath);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        ended_at INTEGER,
        status TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL,
        text TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS usage_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        frame_count INTEGER NOT NULL,
        audio_seconds REAL NOT NULL,
        message_count INTEGER NOT NULL,
        estimated_cost_usd REAL NOT NULL,
        created_at INTEGER NOT NULL
      );
    `);
  }

  createSession(session: SessionRecord): void {
    this.db
      .prepare("INSERT INTO sessions (id, created_at, expires_at, status) VALUES (?, ?, ?, ?)")
      .run(session.id, session.createdAt, session.expiresAt, session.status);
  }

  endSession(session: SessionRecord): void {
    this.db
      .prepare("UPDATE sessions SET ended_at = ?, status = ? WHERE id = ?")
      .run(Date.now(), session.status, session.id);
  }

  addMessage(id: string, sessionId: string, role: "user" | "assistant", text: string): void {
    this.db
      .prepare("INSERT INTO messages (id, session_id, role, text, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, sessionId, role, text, Date.now());
  }

  addUsageEvent(sessionId: string, usage: UsageSnapshot): void {
    this.db
      .prepare(
        `INSERT INTO usage_events
          (session_id, frame_count, audio_seconds, message_count, estimated_cost_usd, created_at)
          VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        sessionId,
        usage.frameCount,
        usage.audioSeconds,
        usage.messageCount,
        usage.estimatedCostUsd,
        Date.now()
      );
  }
}
