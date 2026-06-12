export type Role = "user" | "assistant" | "system";

export interface ConversationMessage {
  id: string;
  role: Role;
  text: string;
  createdAt: number;
  streaming?: boolean;
}

export interface UsageSnapshot {
  frameCount: number;
  audioSeconds: number;
  messageCount: number;
  estimatedCostUsd: number;
  expiresAt: number;
}
