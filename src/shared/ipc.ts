/** Shared IPC contract between main, preload and renderer. */

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface BrowserState {
  id: string;
  url: string;
  title: string;
  canGoBack: boolean;
  canGoForward: boolean;
}

/** The API the preload bridge exposes on `window.ibe`. */
export interface IbeApi {
  createBrowser(id: string, url: string): void;
  setBounds(id: string, bounds: Bounds): void;
  setVisible(id: string, visible: boolean): void;
  navigate(id: string, url: string): void;
  goBack(id: string): void;
  goForward(id: string): void;
  reload(id: string): void;
  destroy(id: string): void;
  onState(cb: (state: BrowserState) => void): () => void;
}
