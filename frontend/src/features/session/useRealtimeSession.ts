import { useCallback, useRef, useState } from "react";
import type { AudioChunk } from "../media/audioChunkSender";
import type { SampledFrame } from "../media/frameSampler";
import type { ConversationMessage, UsageSnapshot } from "./types";

type ConnectionStatus = "idle" | "connecting" | "connected" | "closed" | "error";

const apiBase = import.meta.env.VITE_API_BASE ?? "http://localhost:4000";

export const useRealtimeSession = () => {
  const [status, setStatus] = useState<ConnectionStatus>("idle");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [usage, setUsage] = useState<UsageSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const connectionSeqRef = useRef(0);
  const assistantTextRef = useRef(new Map<string, string>());

  const start = useCallback(async (): Promise<boolean> => {
    resetSessionView();
    const connectionSeq = connectionSeqRef.current + 1;
    connectionSeqRef.current = connectionSeq;
    setStatus("connecting");
    setError(null);

    try {
      const response = await fetch(`${apiBase}/api/sessions`, { method: "POST" });
      if (!response.ok) throw new Error("创建会话失败");

      const body = (await response.json()) as { sessionId: string; wsPath: string };
      if (!isCurrentConnection(connectionSeq)) return false;

      const wsUrl = new URL(body.wsPath, apiBase.replace(/^http/, "ws"));
      const socket = new WebSocket(wsUrl);
      socketRef.current = socket;
      setSessionId(body.sessionId);

      socket.onopen = () => {
        if (!isCurrentConnection(connectionSeq)) return;
        setStatus("connected");
        sendRaw({ type: "control", action: "start" });
      };

      socket.onmessage = (event) => {
        if (!isCurrentConnection(connectionSeq)) return;
        const data = JSON.parse(String(event.data)) as
          | { type: "ai.delta"; messageId: string; text: string }
          | { type: "ai.done"; messageId: string }
          | { type: "usage"; usage: UsageSnapshot }
          | { type: "error"; message: string }
          | { type: "session.ended"; reason: string };

        if (data.type === "ai.delta") {
          assistantTextRef.current.set(
            data.messageId,
            `${assistantTextRef.current.get(data.messageId) ?? ""}${data.text}`
          );
          setMessages((current) => upsertAssistantDelta(current, data.messageId, data.text));
        } else if (data.type === "ai.done") {
          setMessages((current) =>
            current.map((message) =>
              message.id === data.messageId ? { ...message, streaming: false } : message
            )
          );
          speakAssistantMessage(data.messageId, assistantTextRef.current.get(data.messageId) ?? "");
        } else if (data.type === "usage") {
          setUsage(data.usage);
        } else if (data.type === "error") {
          setError(data.message);
        } else if (data.type === "session.ended") {
          setStatus("closed");
        }
      };

      socket.onerror = () => {
        if (!isCurrentConnection(connectionSeq)) return;
        setStatus("error");
        setError("实时连接异常");
      };

      socket.onclose = () => {
        if (!isCurrentConnection(connectionSeq)) return;
        socketRef.current = null;
        setStatus("closed");
      };

      return true;
    } catch (err) {
      if (!isCurrentConnection(connectionSeq)) return false;

      setStatus("error");
      setError(err instanceof Error ? err.message : "创建会话失败");
      return false;
    }
  }, []);

  const sendText = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    setMessages((current) => [
      ...current,
      { id: crypto.randomUUID(), role: "user", text: trimmed, createdAt: Date.now() }
    ]);
    sendRaw({ type: "text", text: trimmed });
  }, []);

  const sendFrame = useCallback((frame: SampledFrame) => {
    sendRaw({ type: "frame", ...frame });
  }, []);

  const sendAudio = useCallback((chunk: AudioChunk) => {
    sendRaw(chunk);
  }, []);

  const sendControl = useCallback((action: "pause" | "resume" | "end") => {
    sendRaw({ type: "control", action });
    if (action === "end") setStatus("closed");
  }, []);

  const interruptSpeech = useCallback(() => {
    window.speechSynthesis?.cancel();
    setSpeakingMessageId(null);
  }, []);

  const close = useCallback(() => {
    const currentSessionId = sessionId;
    const currentSocket = socketRef.current;
    sendRaw({ type: "control", action: "end" });
    connectionSeqRef.current += 1;
    currentSocket?.close();
    if (socketRef.current === currentSocket) socketRef.current = null;
    if (currentSessionId) {
      void fetch(`${apiBase}/api/sessions/${currentSessionId}/end`, { method: "POST" });
    }
    interruptSpeech();
    setStatus("closed");
    setSessionId(null);
  }, [interruptSpeech, sessionId]);

  const sendRaw = (payload: object) => {
    const socket = socketRef.current;
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(payload));
    }
  };

  return {
    status,
    sessionId,
    messages,
    usage,
    error,
    speakingMessageId,
    start,
    sendText,
    sendFrame,
    sendAudio,
    sendControl,
    interruptSpeech,
    close
  };

  function speakAssistantMessage(messageId: string, text: string) {
    if (!("speechSynthesis" in window) || !text.trim()) return;

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "zh-CN";
    utterance.rate = 1;
    utterance.onstart = () => setSpeakingMessageId(messageId);
    utterance.onend = () => setSpeakingMessageId(null);
    utterance.onerror = () => setSpeakingMessageId(null);
    window.speechSynthesis.speak(utterance);
  }

  function resetSessionView() {
    const currentSocket = socketRef.current;
    connectionSeqRef.current += 1;
    currentSocket?.close();
    if (socketRef.current === currentSocket) socketRef.current = null;
    assistantTextRef.current.clear();
    setSessionId(null);
    setMessages([]);
    setUsage(null);
    setSpeakingMessageId(null);
  }

  function isCurrentConnection(connectionSeq: number) {
    return connectionSeqRef.current === connectionSeq;
  }
};

const upsertAssistantDelta = (
  messages: ConversationMessage[],
  id: string,
  delta: string
): ConversationMessage[] => {
  const existing = messages.find((message) => message.id === id);
  if (!existing) {
    return [
      ...messages,
      { id, role: "assistant", text: delta, createdAt: Date.now(), streaming: true }
    ];
  }

  return messages.map((message) =>
    message.id === id ? { ...message, text: message.text + delta, streaming: true } : message
  );
};
