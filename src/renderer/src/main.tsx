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
    if (saved && !useStore.getState().hydrate(saved)) {
      // keep the rejected payload out of harm's way: the default layout is
      // about to be auto-saved over session.json
      console.error("[session] restore rejected — quarantining payload");
      ibe.session.quarantine(saved);
    }
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
