import { app, Menu, type MenuItemConstructorOptions, type WebContents } from "electron";
import type { ShortcutAction } from "../shared/ipc";

/**
 * Application menu. Its accelerators are the app's real keyboard shortcuts:
 * unlike a renderer keydown listener, native menu accelerators fire even while
 * a WebContentsView has keyboard focus. Each item just forwards a ShortcutAction
 * to the renderer, which resolves it against its own focused pane.
 */
export function buildAppMenu(getWebContents: () => WebContents | null): Menu {
  const send = (action: ShortcutAction) => () => getWebContents()?.send("shortcut", action);

  // Some actions target a renderer DOM element (address bar, settings modal).
  // If a native WebContentsView holds OS keyboard focus, focusing renderer DOM
  // alone doesn't redirect keystrokes there — pull focus back to the renderer
  // first, then dispatch the action.
  const focusThenSend = (action: ShortcutAction) => () => {
    const wc = getWebContents();
    if (!wc) return;
    wc.focus();
    wc.send("shortcut", action);
  };

  const isMac = process.platform === "darwin";

  // On macOS, Settings lives in the app menu (⌘,) per platform convention; on
  // other platforms it's surfaced under the Workspace menu below.
  const appMenu: MenuItemConstructorOptions = {
    label: app.name,
    submenu: [
      { role: "about" },
      { type: "separator" },
      {
        label: "Settings…",
        accelerator: "CmdOrCtrl+,",
        click: focusThenSend("open-settings"),
      },
      { type: "separator" },
      { role: "services" },
      { type: "separator" },
      { role: "hide" },
      { role: "hideOthers" },
      { role: "unhide" },
      { type: "separator" },
      { role: "quit" },
    ],
  };

  const workspaceMenu: MenuItemConstructorOptions = {
    label: "Workspace",
    submenu: [
      { label: "New Tab", accelerator: "CmdOrCtrl+T", click: send("new-tab") },
      { label: "Close Pane", accelerator: "CmdOrCtrl+W", click: send("close-pane") },
      { label: "Close Tab", accelerator: "CmdOrCtrl+Shift+W", click: send("close-tab") },
      { type: "separator" },
      { label: "Split Right", accelerator: "CmdOrCtrl+D", click: send("split-h") },
      { label: "Split Down", accelerator: "CmdOrCtrl+Shift+D", click: send("split-v") },
      { type: "separator" },
      { label: "Focus Address Bar", accelerator: "CmdOrCtrl+L", click: focusThenSend("focus-address") },
      { label: "Reload Pane", accelerator: "CmdOrCtrl+R", click: send("reload") },
      { type: "separator" },
      { label: "Previous Tab", accelerator: "CmdOrCtrl+Shift+[", click: send("prev-tab") },
      { label: "Next Tab", accelerator: "CmdOrCtrl+Shift+]", click: send("next-tab") },
      // Settings lives in the app menu on macOS; expose it here elsewhere.
      ...(isMac
        ? []
        : ([
            { type: "separator" },
            { label: "Settings…", accelerator: "CmdOrCtrl+,", click: focusThenSend("open-settings") },
          ] as MenuItemConstructorOptions[])),
    ],
  };

  const template: MenuItemConstructorOptions[] = [
    ...(isMac ? [appMenu] : []),
    { role: "editMenu" }, // undo/cut/copy/paste/selectAll — needed in browser & terminal
    workspaceMenu,
    { role: "windowMenu" },
  ];

  return Menu.buildFromTemplate(template);
}
