export interface SampledFrame {
  mimeType: "image/jpeg";
  width: number;
  height: number;
  bytes: number;
  dataUrl: string;
}

interface FrameSamplerOptions {
  video: HTMLVideoElement;
  intervalMs?: number;
  maxWidth?: number;
  quality?: number;
  onFrame: (frame: SampledFrame) => void;
  onError?: (message: string) => void;
}

export const startFrameSampler = ({
  video,
  intervalMs = 1500,
  maxWidth = 512,
  quality = 0.65,
  onFrame,
  onError
}: FrameSamplerOptions): (() => void) => {
  let stopped = false;
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  const capture = async () => {
    if (stopped || !context || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;

    const sourceWidth = video.videoWidth;
    const sourceHeight = video.videoHeight;
    if (!sourceWidth || !sourceHeight) return;

    const scale = Math.min(1, maxWidth / sourceWidth);
    canvas.width = Math.round(sourceWidth * scale);
    canvas.height = Math.round(sourceHeight * scale);
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    const blob = await toJpegBlob(canvas, quality);
    if (stopped) return;

    if (!blob) {
      onError?.("抽帧失败");
      return;
    }

    if (blob.size > 200 * 1024) {
      onError?.("压缩后单帧仍超过 200KB，已跳过");
      return;
    }

    const dataUrl = await blobToDataUrl(blob);
    if (stopped) return;

    onFrame({
      mimeType: "image/jpeg",
      width: canvas.width,
      height: canvas.height,
      bytes: blob.size,
      dataUrl
    });
  };

  const timer = window.setInterval(() => {
    void capture();
  }, intervalMs);

  return () => {
    stopped = true;
    window.clearInterval(timer);
  };
};

const toJpegBlob = (canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> =>
  new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));

const blobToDataUrl = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
