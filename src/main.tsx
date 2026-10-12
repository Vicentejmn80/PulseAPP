import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import "./index.css";
import { PulseProvider } from "./state/PulseContext";
import { registerSW } from "virtual:pwa-register";

let reloadingForUpdate = false;
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloadingForUpdate) return;
    reloadingForUpdate = true;
    window.location.reload();
  });
}

registerSW({
  immediate: true,
  onRegisteredSW(_swUrl, registration) {
    if (!registration) return;
    const poll = () => registration.update().catch(() => undefined);
    poll();
    window.setInterval(poll, 60 * 1000);
  },
  onNeedRefresh() {
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
