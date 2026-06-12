import { useEffect, useRef, useState } from "react";
import { ControlBar } from "../components/ControlBar";
import { ConversationPanel } from "../components/ConversationPanel";
import { UsageStrip } from "../components/UsageStrip";
import { VideoPreview } from "../components/VideoPreview";
import { startAudioChunkSender } from "../features/media/audioChunkSender";
import { startFrameSampler } from "../features/media/frameSampler";
import { useMediaDevices } from "../features/media/useMediaDevices";
import { useSpeechRecognition } from "../features/media/useSpeechRecognition";
import { useRealtimeSession } from "../features/session/useRealtimeSession";

export const App = () => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const media = useMediaDevices();
  const session = useRealtimeSession();
  const [hasVisionFrame, setHasVisionFrame] = useState(false);
  const [providerMode, setProviderMode] = useState("检测中");
  const speech = useSpeechRecognition((text) => {
    session.sendText(text);
  });
  const connected = session.status === "connected";

  useEffect(() => {
    const apiBase = import.meta.env.VITE_API_BASE ?? "http://localhost:4000";
    let active = true;

    fetch(`${apiBase}/health`)
      .then((response) => {
        if (!response.ok) throw new Error("health failed");
        return response.json() as Promise<{ provider?: string }>;
      })
      .then((body) => {
        if (active) setProviderMode(body.provider ?? "未知");
      })
      .catch(() => {
        if (active) setProviderMode("未知");
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!connected || media.status !== "active" || !videoRef.current) return;

    return startFrameSampler({
      video: videoRef.current,
      onFrame: (frame) => {
        setHasVisionFrame(true);
        session.sendFrame(frame);
      }
    });
  }, [connected, media.status, session.sendFrame]);

  useEffect(() => {
    if (!connected || media.status !== "active" || !media.stream) return;

    return startAudioChunkSender({
      stream: media.stream,
      onChunk: session.sendAudio
    });
  }, [connected, media.status, media.stream, session.sendAudio]);

  useEffect(() => {
    if (!connected || media.status !== "active") return;
    speech.start();
    return speech.stop;
  }, [connected, media.status, speech.start, speech.stop]);

  useEffect(() => {
    if (
      speech.status !== "unsupported" ||
      !connected ||
      media.status !== "active" ||
      media.speechPulse === 0
    ) {
      return;
    }

    session.sendText("我刚才说话了，请结合当前画面简短回应。");
  }, [connected, media.status, media.speechPulse, session.sendText, speech.status]);

  const start = async () => {
    setHasVisionFrame(false);
    const mediaStarted = await media.start();
    if (!mediaStarted) return;
    const sessionStarted = await session.start();
    if (!sessionStarted) {
      speech.stop();
      media.stop();
    }
  };

  const pause = () => {
    setHasVisionFrame(false);
    media.pause();
    session.sendControl("pause");
  };

  const resume = () => {
    setHasVisionFrame(false);
    media.resume();
    session.sendControl("resume");
  };

  const end = () => {
    setHasVisionFrame(false);
    speech.stop();
    media.stop();
    session.close();
  };

  return (
    <main className="appShell">
      <header className="topBar">
        <div>
          <h1>AI 视觉对话助手</h1>
          <p>本地采集、端侧压缩、后端模式：{providerMode}</p>
        </div>
        <UsageStrip usage={session.usage} sessionId={session.sessionId} />
      </header>

      <div className="workspace">
        <div className="leftColumn">
          <VideoPreview
            stream={media.stream}
            status={media.status}
            micLevel={media.micLevel}
            speechStatus={speech.status}
            speechText={speech.interimText}
            videoRef={videoRef}
          />
          <ControlBar
            mediaStatus={media.status}
            connected={connected}
            onStart={() => void start()}
            onPause={pause}
            onResume={resume}
            onInterrupt={session.interruptSpeech}
            canInterrupt={Boolean(session.speakingMessageId)}
            onEnd={end}
          />
          {(media.error || session.error) && (
            <div className="errorLine">{media.error ?? session.error}</div>
          )}
        </div>

        <ConversationPanel
          messages={session.messages}
          disabled={!connected || media.status !== "active"}
          visionReady={hasVisionFrame}
          speakingMessageId={session.speakingMessageId}
          onSend={session.sendText}
        />
      </div>
    </main>
  );
};
