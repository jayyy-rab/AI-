import { Send } from "lucide-react";
import { useState } from "react";
import type { ConversationMessage } from "../features/session/types";

interface ConversationPanelProps {
  messages: ConversationMessage[];
  disabled: boolean;
  visionReady: boolean;
  speakingMessageId: string | null;
  onSend: (text: string) => void;
}

export const ConversationPanel = ({
  messages,
  disabled,
  visionReady,
  speakingMessageId,
  onSend
}: ConversationPanelProps) => {
  const [text, setText] = useState("");

  const submit = () => {
    const value = text.trim();
    if (!value) return;
    onSend(value);
    setText("");
  };

  return (
    <section className="conversationPane" aria-label="对话">
      <div className="messages">
        {messages.length === 0 ? (
          <div className="emptyMessages">开始后询问画面内容</div>
        ) : (
          messages.map((message) => (
            <article className={`message ${message.role}`} key={message.id}>
              <span>
                {message.role === "user" ? "你" : "AI"}
                {speakingMessageId === message.id ? " 正在播放" : ""}
              </span>
              <p>{message.text}{message.streaming ? "..." : ""}</p>
            </article>
          ))
        )}
      </div>
      <div className="composer">
        <div className="visionReadyLine">
          {visionReady ? "视觉帧已就绪" : "等待首个视觉帧"}
        </div>
        <div className="promptChips" aria-label="视觉验收问题">
          {visionPrompts.map((prompt) => (
            <button
              type="button"
              key={prompt}
              disabled={disabled || !visionReady}
              onClick={() => onSend(prompt)}
            >
              {prompt}
            </button>
          ))}
        </div>
        <input
          value={text}
          disabled={disabled}
          placeholder="输入：画面里有什么？"
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") submit();
          }}
        />
        <button type="button" disabled={disabled || !text.trim()} onClick={submit} title="发送">
          <Send size={18} />
        </button>
      </div>
    </section>
  );
};

const visionPrompts = [
  "画面里有什么？",
  "主要颜色是什么？",
  "我手里拿着什么？"
];
