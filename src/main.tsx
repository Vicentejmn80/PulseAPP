import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import "./index.css";
import { PulseProvider } from "./state/PulseContext";
import { registerSW } from "virtual:pwa-register";

registerSW({
  immediate: true,
  onRegisteredSW(_swUrl, registration) {
    if (!registration) return;
    const poll = () => registration.update().catch(() => undefined);
    poll();
    window.setInterval(poll, 60 * 60 * 1000);
  },
  onNeedRefresh() {
    // Tras un deploy, la PWA en iOS puede quedarse en el bundle anterior.
    window.location.reload();
  },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <PulseProvider>
        <App />
      </PulseProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
