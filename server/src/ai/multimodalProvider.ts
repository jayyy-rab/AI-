import type { CachedFrame, ConversationTurn } from "../types.js";

export interface ProviderTurnInput {
  sessionId: string;
  text: string;
  frameCount: number;
  frames: CachedFrame[];
  recentMessages: ConversationTurn[];
}

export interface MultimodalProvider {
  streamResponse(input: ProviderTurnInput): AsyncIterable<string>;
}
