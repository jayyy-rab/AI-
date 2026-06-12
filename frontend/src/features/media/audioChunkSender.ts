export interface AudioChunk {
  type: "audio";
  mimeType: string;
  durationMs: number;
  bytes: number;
  dataUrl: string;
}

interface AudioChunkSenderOptions {
  stream: MediaStream;
  intervalMs?: number;
  onChunk: (chunk: AudioChunk) => void;
  onError?: (message: string) => void;
}

export const startAudioChunkSender = ({
  stream,
  intervalMs = 1000,
  onChunk,
  onError
}: AudioChunkSenderOptions): (() => void) => {
  if (!window.MediaRecorder) {
    onError?.("当前浏览器不支持 MediaRecorder");
    return () => undefined;
  }

  const audioTracks = stream.getAudioTracks();
  if (audioTracks.length === 0) return () => undefined;

  const audioStream = new MediaStream(audioTracks);
  const mimeType = pickAudioMimeType();
  const recorder = new MediaRecorder(audioStream, mimeType ? { mimeType } : undefined);
  let lastChunkAt = Date.now();
  let stopped = false;

  recorder.ondataavailable = (event) => {
    if (stopped) return;
    if (!event.data.size) return;

    const now = Date.now();
    const durationMs = Math.max(0, now - lastChunkAt);
    lastChunkAt = now;

    void blobToDataUrl(event.data).then((dataUrl) => {
      if (stopped) return;
      onChunk({
        type: "audio",
        mimeType: event.data.type || mimeType || "audio/webm",
        durationMs,
        bytes: event.data.size,
        dataUrl
      });
    });
  };

  recorder.onerror = () => {
    if (stopped) return;
    onError?.("音频片段采集失败");
  };

  recorder.start(intervalMs);

  return () => {
    stopped = true;
    if (recorder.state !== "inactive") recorder.stop();
  };
};

const pickAudioMimeType = () => {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"];
  return candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate)) ?? "";
};

const blobToDataUrl = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
