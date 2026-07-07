import {
  clipboard,
  Menu,
  type ContextMenuParams,
  type MenuItemConstructorOptions,
  type WebContents,
} from "electron";

/**
 * Right-click menu for browser panes. Electron shows nothing by default; we
 * build a native menu from what was clicked (link / selection / editable /
 * image) plus the common navigation actions. "Open in new pane" routes through
 * the same browser:open-new path as target=_blank links, so it lands in a new
 * pane split off the clicked one.
 */

function truncate(s: string, max = 24): string {
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

/**
 * Toggle picture-in-picture for the <video> under the click point. Walks the
 * whole elementsFromPoint stack because sites (e.g. Google Meet) layer name
 * badges and hover controls over their video tiles.
 */
function pipToggleScript(x: number, y: number): string {
  return `(() => {
    const hits = document.elementsFromPoint(${Math.round(x)}, ${Math.round(y)});
    let video = hits.find((el) => el.tagName === "VIDEO");
    if (!video) {
      for (const el of hits) {
        const v = el.querySelector?.("video");
        if (v) { video = v; break; }
      }
    }
    if (!video) return;
    if (document.pictureInPictureElement === video) {
      document.exitPictureInPicture().catch(() => {});
    } else {
      video.disablePictureInPicture = false;
      video.requestPictureInPicture().catch(() => {});
    }
  })()`;
}

export function attachBrowserContextMenu(
  wc: WebContents,
  paneId: string,
  getHost: () => WebContents | null
): void {
  wc.on("context-menu", (_e, params: ContextMenuParams) => {
    const openInNewPane = (url: string) =>
      getHost()?.send("browser:open-new", { fromId: paneId, url });
    const openInNewTab = (url: string) =>
      getHost()?.send("browser:open-new", { fromId: paneId, url, target: "tab" });

    const items: MenuItemConstructorOptions[] = [];

    if (params.linkURL) {
      items.push(
        { label: "新規ペインで開く", click: () => openInNewPane(params.linkURL) },
        {
          label: "新規ワークスペースで開く",
          click: () => openInNewTab(params.linkURL),
        },
        { label: "リンクをコピー", click: () => clipboard.writeText(params.linkURL) },
        { type: "separator" }
      );
    }

    if (params.mediaType === "image" && params.srcURL) {
      items.push(
        {
          label: "画像アドレスをコピー",
          click: () => clipboard.writeText(params.srcURL),
        },
        { type: "separator" }
      );
    }

    if (params.mediaType === "video") {
      items.push(
        {
          label: "ピクチャインピクチャ",
          // userGesture: true — requestPictureInPicture needs user activation
          click: () =>
            wc
              .executeJavaScript(pipToggleScript(params.x, params.y), true)
              .catch(() => {}),
        },
        { type: "separator" }
      );
    }

    const selection = params.selectionText.trim();
    if (params.isEditable) {
      items.push(
        { label: "カット", role: "cut", enabled: params.editFlags.canCut },
        { label: "コピー", role: "copy", enabled: params.editFlags.canCopy },
        { label: "ペースト", role: "paste", enabled: params.editFlags.canPaste },
        { label: "すべて選択", role: "selectAll" },
        { type: "separator" }
      );
    } else if (selection) {
      items.push(
        { label: "コピー", role: "copy" },
        {
          label: `「${truncate(selection)}」を Google で検索`,
          click: () =>
            openInNewPane(
              `https://www.google.com/search?q=${encodeURIComponent(selection)}`
            ),
        },
        { type: "separator" }
      );
    }

    items.push(
      {
        label: "戻る",
        enabled: wc.navigationHistory.canGoBack(),
        click: () => wc.navigationHistory.goBack(),
      },
      {
        label: "進む",
        enabled: wc.navigationHistory.canGoForward(),
        click: () => wc.navigationHistory.goForward(),
      },
      { label: "再読み込み", click: () => wc.reload() },
      { type: "separator" },
      {
        label: "検証",
        click: () => wc.inspectElement(params.x, params.y),
      }
    );

    Menu.buildFromTemplate(items).popup();
  });
}
