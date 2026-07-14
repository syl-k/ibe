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
 * Toggle picture-in-picture for a video, enlarging just that video into a
 * floating, resizable window. Prefers the video under the click point (walking
 * elementsFromPoint, since sites like Google Meet layer name badges / hover
 * controls over their tiles); if the click didn't land on a video, falls back
 * to the LARGEST video on the page — which for Meet is the shared screen.
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
    if (!video) {
      // no video under the cursor → pick the biggest playing video (screen share)
      const area = (v) => { const r = v.getBoundingClientRect(); return r.width * r.height; };
      video = [...document.querySelectorAll("video")]
        .filter((v) => (v.readyState >= 1 || v.srcObject) && area(v) > 0)
        .sort((a, b) => area(b) - area(a))[0];
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

/** Whether the page currently has any <video> (raced with a short timeout so a
 *  busy renderer never stalls the context menu). */
async function pageHasVideo(wc: WebContents): Promise<boolean> {
  try {
    return await Promise.race([
      wc.executeJavaScript(`!!document.querySelector("video")`),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 200)),
    ]);
  } catch {
    return false;
  }
}

export function attachBrowserContextMenu(
  wc: WebContents,
  paneId: string,
  getHost: () => WebContents | null
): void {
  wc.on("context-menu", async (_e, params: ContextMenuParams) => {
    const openInNewPane = (url: string) =>
      getHost()?.send("browser:open-new", { fromId: paneId, url });
    const openInNewTab = (url: string) =>
      getHost()?.send("browser:open-new", { fromId: paneId, url, target: "tab" });

    // Offer PiP whenever the page has a video — not only when the click landed
    // exactly on one. Google Meet overlays controls on the shared screen, so a
    // right-click there reports mediaType "none"; without this the menu item
    // would never appear over the very thing the user wants to enlarge.
    const showPip =
      params.mediaType === "video" || (await pageHasVideo(wc));

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

    if (showPip) {
      items.push(
        {
          label: "画面共有を拡大（ピクチャインピクチャ）",
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
