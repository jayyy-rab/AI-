import { Pause, Play, RotateCcw, Square, VolumeX } from "lucide-react";
import type { MediaStatus } from "../features/media/useMediaDevices";

interface ControlBarProps {
  mediaStatus: MediaStatus;
  connected: boolean;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onInterrupt: () => void;
  onEnd: () => void;
  canInterrupt: boolean;
}

export const ControlBar = ({
  mediaStatus,
  connected,
  onStart,
  onPause,
  onResume,
  onInterrupt,
  canInterrupt,
  onEnd
}: ControlBarProps) => {
  const canStart = mediaStatus === "idle" || mediaStatus === "ended" || mediaStatus === "error";
  const canPause = mediaStatus === "active" && connected;
  const canResume = mediaStatus === "paused" && connected;
  const canEnd = (mediaStatus === "active" || mediaStatus === "paused") && connected;

  return (
    <div className="controlBar">
      <button type="button" onClick={onStart} disabled={!canStart} title="开始">
        <Play size={18} />
        开始
      </button>
      <button type="button" onClick={onPause} disabled={!canPause} title="暂停">
        <Pause size={18} />
        暂停
      </button>
      <button type="button" onClick={onResume} disabled={!canResume} title="继续">
        <RotateCcw size={18} />
        继续
      </button>
      <button type="button" onClick={onInterrupt} disabled={!canInterrupt} title="打断播放">
        <VolumeX size={18} />
        打断
      </button>
      <button type="button" onClick={onEnd} disabled={!canEnd} title="结束">
        <Square size={18} />
        结束
      </button>
    </div>
  );
};
