import { useCallback, useRef, useState } from "react";

export type SpeechRecognitionStatus = "unsupported" | "idle" | "listening" | "error";

interface SpeechRecognitionResult {
  readonly isFinal: boolean;
  readonly 0: { transcript: string };
}

interface SpeechRecognitionResultList {
  readonly length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionEventLike extends Event {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultList;
}

interface SpeechRecognitionLike extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  start(): void;
  stop(): void;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

interface SpeechWindow extends Window {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
}

export const useSpeechRecognition = (onFinalTranscript: (text: string) => void) => {
  const [status, setStatus] = useState<SpeechRecognitionStatus>("idle");
  const [interimText, setInterimText] = useState("");
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const shouldListenRef = useRef(false);
  const callbackRef = useRef(onFinalTranscript);
  callbackRef.current = onFinalTranscript;

  const start = useCallback(() => {
    const Recognition = getRecognitionConstructor();
    if (!Recognition) {
      setStatus("unsupported");
      return;
    }

    shouldListenRef.current = true;
    if (recognitionRef.current) return;

    const recognition = new Recognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "zh-CN";

    recognition.onresult = (event) => {
      let finalText = "";
      let interim = "";

      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const transcript = result[0].transcript.trim();
        if (result.isFinal) finalText += transcript;
        else interim += transcript;
      }

      setInterimText(interim);
      if (finalText) callbackRef.current(finalText);
    };

    recognition.onerror = () => {
      setStatus("error");
    };

    recognition.onend = () => {
      recognitionRef.current = null;
      if (shouldListenRef.current) {
        window.setTimeout(() => start(), 400);
      } else {
        setStatus("idle");
      }
    };

    recognitionRef.current = recognition;
    setStatus("listening");
    recognition.start();
  }, []);

  const stop = useCallback(() => {
    shouldListenRef.current = false;
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setInterimText("");
    setStatus((current) => (current === "unsupported" ? "unsupported" : "idle"));
  }, []);

  return {
    status,
    interimText,
    start,
    stop
  };
};

const getRecognitionConstructor = (): SpeechRecognitionConstructor | undefined => {
  const speechWindow = window as SpeechWindow;
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
};
