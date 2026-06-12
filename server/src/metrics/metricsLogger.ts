interface MetricEvent {
  event: string;
  sessionId: string;
  latencyMs?: number;
  frameCount?: number;
  audioSeconds?: number;
  messageCount?: number;
  estimatedCostUsd?: number;
  outputChars?: number;
  error?: string;
}

export class MetricsLogger {
  info(event: MetricEvent): void {
    console.info(JSON.stringify({
      level: "info",
      component: "metrics",
      time: new Date().toISOString(),
      ...event
    }));
  }

  error(event: MetricEvent): void {
    console.error(JSON.stringify({
      level: "error",
      component: "metrics",
      time: new Date().toISOString(),
      ...event
    }));
  }
}
