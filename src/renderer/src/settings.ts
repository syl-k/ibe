import { create } from "zustand";
import type { Settings } from "../../shared/ipc";

/**
 * Renderer-side mirror of the user preferences owned by main. Editing a field
 * applies it live (theme -> document, font -> terminals via subscribers) and
 * persists the whole object back to main; `replace` takes an authoritative value
 * from main (initial load / external change) without echoing a save.
 */

export const DEFAULT_SETTINGS: Settings = {
  theme: "mocha",
  terminalFontFamily: '"SF Mono", Menlo, monospace',
  terminalFontSize: 12,
  shell: "",
};

/** Apply the theme by tagging the document root; CSS variables key off it. */
function applyTheme(theme: Settings["theme"]): void {
  document.documentElement.dataset.theme = theme;
}

interface SettingsState {
  settings: Settings;
  /** user edit -> update, apply theme, persist to main */
  update: (patch: Partial<Settings>) => void;
  /** authoritative value from main -> apply without persisting */
  replace: (s: Settings) => void;
}

export const useSettings = create<SettingsState>((set, get) => ({
  settings: DEFAULT_SETTINGS,

  update: (patch) => {
    const next = { ...get().settings, ...patch };
    set({ settings: next });
    applyTheme(next.theme);
    window.ibe.settings.save(next);
  },

  replace: (s) => {
    set({ settings: s });
    applyTheme(s.theme);
  },
}));
