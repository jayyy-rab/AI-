import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "./styles.css";

function App() {
  return (
    <main className="app-shell">
      <section className="intro-panel">
        <p className="eyebrow">AI Vision Voice Assistant</p>
        <h1>AI 视觉对话助手</h1>
        <p>工程骨架已就绪，后续 PR 将逐步加入演示界面、媒体采集和实时对话能力。</p>
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
