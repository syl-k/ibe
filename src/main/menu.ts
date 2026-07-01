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

  // Focus-address must first pull OS keyboard focus back to the renderer: if a
  // native WebContentsView holds focus, focusing a renderer DOM input alone
  // doesn't redirect keystrokes there.
  const focusAddress = () => {
    const wc = getWebContents();
    if (!wc) return;
    wc.focus();
    wc.send("shortcut", "focus-address");
  };

  const isMac = process.platform === "darwin";

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
      { label: "Focus Address Bar", accelerator: "CmdOrCtrl+L", click: focusAddress },
      { label: "Reload Pane", accelerator: "CmdOrCtrl+R", click: send("reload") },
      { type: "separator" },
      { label: "Previous Tab", accelerator: "CmdOrCtrl+Shift+[", click: send("prev-tab") },
      { label: "Next Tab", accelerator: "CmdOrCtrl+Shift+]", click: send("next-tab") },
    ],
  };

  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? [{ label: app.name, role: "appMenu" } as MenuItemConstructorOptions]
      : []),
    { role: "editMenu" }, // undo/cut/copy/paste/selectAll — needed in browser & terminal
    workspaceMenu,
    { role: "windowMenu" },
  ];

  return Menu.buildFromTemplate(template);
}
