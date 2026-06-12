import { useCallback, useRef, useState } from "react";

export type MediaStatus = "idle" | "requesting" | "active" | "paused" | "ended" | "error";

export const useMediaDevices = () => {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [status, setStatus] = useState<MediaStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [micLevel, setMicLevel] = useState(0);
  const [speechPulse, setSpeechPulse] = useState(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const animationRef = useRef<number | null>(null);

  const cleanupAudio = useCallback(() => {
    if (animationRef.current) window.cancelAnimationFrame(animationRef.current);
    animationRef.current = null;
    void audioContextRef.current?.close();
    audioContextRef.current = null;
    setMicLevel(0);
  }, []);

  const stop = useCallback(() => {
    setStream((current) => {
      current?.getTracks().forEach((track) => track.stop());
      return null;
    });
    cleanupAudio();
    setStatus("ended");
  }, [cleanupAudio]);

  const start = useCallback(async (): Promise<boolean> => {
    setStatus("requesting");
    setError(null);

    try {
      const nextStream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
        audio: { echoCancellation: true, noiseSuppression: true }
      });

      setStream(nextStream);
      setStatus("active");
      attachVolumeMeter(nextStream, audioContextRef, animationRef, setMicLevel, setSpeechPulse);
      return true;
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "无法访问摄像头或麦克风");
      return false;
    }
  }, []);

  const pause = useCallback(() => {
    stream?.getTracks().forEach((track) => {
      track.enabled = false;
    });
    setStatus("paused");
  }, [stream]);

  const resume = useCallback(() => {
    stream?.getTracks().forEach((track) => {
      track.enabled = true;
    });
    setStatus("active");
  }, [stream]);

  return {
    stream,
    status,
    error,
    micLevel,
    speechPulse,
    start,
    pause,
    resume,
    stop
  };
};

const attachVolumeMeter = (
  stream: MediaStream,
  audioContextRef: React.MutableRefObject<AudioContext | null>,
  animationRef: React.MutableRefObject<number | null>,
  setMicLevel: (value: number) => void,
  setSpeechPulse: React.Dispatch<React.SetStateAction<number>>
) => {
  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  const audioContext = new AudioContextCtor();
  audioContextRef.current = audioContext;

  const analyser = audioContext.createAnalyser();
  analyser.fftSize = 512;
  const source = audioContext.createMediaStreamSource(stream);
  source.connect(analyser);
  const data = new Uint8Array(analyser.frequencyBinCount);
  let voiceStartedAt = 0;
  let lastPulseAt = 0;

  const tick = () => {
    analyser.getByteTimeDomainData(data);
    let sum = 0;
    for (const value of data) {
      const normalized = (value - 128) / 128;
      sum += normalized * normalized;
    }
    const level = Math.min(1, Math.sqrt(sum / data.length) * 4);
    const now = Date.now();
    setMicLevel(level);

    if (level > 0.18) {
      voiceStartedAt = voiceStartedAt || now;
      if (now - voiceStartedAt > 700 && now - lastPulseAt > 8000) {
        lastPulseAt = now;
        setSpeechPulse((value) => value + 1);
      }
    } else {
      voiceStartedAt = 0;
    }

    animationRef.current = window.requestAnimationFrame(tick);
  };

  tick();
};
