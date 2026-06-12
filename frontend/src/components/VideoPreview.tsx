import { Camera, Mic } from "lucide-react";
import { useEffect } from "react";
import type { MediaStatus } from "../features/media/useMediaDevices";
import type { SpeechRecognitionStatus } from "../features/media/useSpeechRecognition";

interface VideoPreviewProps {
  stream: MediaStream | null;
  status: MediaStatus;
  micLevel: number;
  speechStatus: SpeechRecognitionStatus;
  speechText: string;
  videoRef: React.RefObject<HTMLVideoElement | null>;
}

export const VideoPreview = ({
  stream,
  status,
  micLevel,
  speechStatus,
  speechText,
  videoRef
}: VideoPreviewProps) => {
  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = stream;
  }, [stream, videoRef]);

  return (
    <section className="videoPane" aria-label="摄像头预览">
      <video ref={videoRef} className="videoPreview" autoPlay muted playsInline />
      {!stream && (
        <div className="emptyVideo">
          <Camera size={38} />
          <span>等待授权摄像头</span>
        </div>
      )}
      <div className="mediaStatus">
        <span className={`statusDot ${status === "active" ? "isActive" : ""}`} />
        <span>{statusLabel[status]}</span>
        <span className="micMeter" title="麦克风音量">
          <Mic size={16} />
          <span style={{ transform: `scaleX(${Math.max(0.04, micLevel)})` }} />
        </span>
        <span>{speechLabel[speechStatus]}</span>
      </div>
      {speechText && <div className="speechCaption">{speechText}</div>}
    </section>
  );
};

const statusLabel: Record<MediaStatus, string> = {
  idle: "未开始",
  requesting: "请求权限",
  active: "采集中",
  paused: "已暂停",
  ended: "已结束",
  error: "权限异常"
};

const speechLabel: Record<SpeechRecognitionStatus, string> = {
  unsupported: "语音识别不可用",
  idle: "语音待命",
  listening: "语音识别中",
  error: "语音识别异常"
};
