import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { serializeSession, useStore } from "./store";
import "@xterm/xterm/css/xterm.css";
import "./styles.css";

const ibe = window.ibe;

async function boot(): Promise<void> {
  // restore the persisted layout BEFORE the first render (no default flash,
  // no throwaway views spawned for the default layout)
  try {
    const saved = await ibe.session.load();
    if (saved) useStore.getState().hydrate(saved);
  } catch (err) {
    console.error("[session] restore failed:", err);
  }

  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );

  // persist layout/tab changes (main debounces the actual write). Title-only
  // updates leave the serialized snapshot unchanged, so they don't trigger saves.
  let last = JSON.stringify(serializeSession(useStore.getState()));
  useStore.subscribe((state) => {
    const json = JSON.stringify(serializeSession(state));
    if (json !== last) {
      last = json;
      ibe.session.save(JSON.parse(json));
    }
  });
}

boot();
