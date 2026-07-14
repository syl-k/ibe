import { ipcRenderer } from "electron";

/**
 * Injected into every browser WebContentsView (sandboxed, isolated world).
 * Detects two-finger trackpad overscroll swipes and mouse back/forward
 * buttons, then asks the main process to walk the page's history.
 *
 * Chrome-like arming model: accumulating horizontal overscroll only ARMS the
 * gesture and shows a progress arrow; navigation fires when the gesture ENDS
 * (wheel events stop) with the accumulated distance past the threshold. That
 * gives the user leeway — swiping back below the threshold before lifting
 * cancels, exactly like Chrome's overscroll arrow.
 *
 * Three-finger discrete swipes never produce wheel events — those arrive as
 * the BrowserWindow "swipe" event and are handled in the main process.
 */

const GESTURE_END_MS = 120; // wheel-event silence treated as "fingers lifted"
const MIN_THRESHOLD = 280; // px of horizontal overscroll to arm navigation
const INDICATOR_MIN = 0.12; // progress below this hides the arrow (noise)

const thresholdFor = (): number =>
  Math.max(MIN_THRESHOLD, window.innerWidth * 0.28);

let dx = 0;
let dy = 0;
let backEligible = false;
let forwardEligible = false;
let endTimer: ReturnType<typeof setTimeout> | undefined;

/** Whether a scrollable ancestor of `el` can still scroll toward `dir`. */
function ancestorCanScroll(el: Element | null, dir: "left" | "right"): boolean {
  for (let node = el; node; node = node.parentElement) {
    if (node.scrollWidth <= node.clientWidth + 1) continue;
    const { overflowX } = getComputedStyle(node);
    if (overflowX !== "auto" && overflowX !== "scroll") continue;
    const remaining =
      dir === "left"
        ? node.scrollLeft
        : node.scrollWidth - node.clientWidth - node.scrollLeft;
    if (remaining > 1) return true;
  }
  return false;
}

/* --- Chrome-style progress arrow (isolated world owns this element) --- */

let indicator: HTMLElement | null = null;

function showIndicator(dir: "back" | "forward", progress: number): void {
  try {
    if (!document.body) return;
    if (!indicator) {
      indicator = document.createElement("div");
      const s = indicator.style;
      s.position = "fixed";
      s.top = "50%";
      s.width = "44px";
      s.height = "44px";
      s.borderRadius = "50%";
      s.display = "flex";
      s.alignItems = "center";
      s.justifyContent = "center";
      s.font = "20px/1 -apple-system, sans-serif";
      s.zIndex = "2147483647";
      s.pointerEvents = "none";
      s.boxShadow = "0 1px 6px rgba(0,0,0,.25)";
      s.transition = "opacity 80ms";
      document.body.appendChild(indicator);
    }
    const ready = progress >= 1;
    const st = indicator.style;
    indicator.textContent = dir === "back" ? "←" : "→";
    st.background = ready ? "#4a90e2" : "rgba(255,255,255,.92)";
    st.color = ready ? "#fff" : "#444";
    st.opacity = String(Math.min(1, 0.35 + progress * 0.65));
    const slide = Math.min(1, progress) * 26 - 34; // slides in as it fills
    if (dir === "back") {
      st.left = `${slide}px`;
      st.right = "auto";
    } else {
      st.right = `${slide}px`;
      st.left = "auto";
    }
    st.transform = `translateY(-50%) scale(${0.7 + Math.min(1, progress) * 0.3})`;
  } catch {
    /* pages with exotic DOM states just lose the visual, not the gesture */
  }
}

function hideIndicator(): void {
  if (indicator) {
    indicator.remove();
    indicator = null;
  }
}

/* --- gesture state machine --- */

function armedDirection(): "back" | "forward" | null {
  if (Math.abs(dx) < Math.abs(dy) * 2) return null; // not horizontal enough
  if (dx < 0 && backEligible) return "back";
  if (dx > 0 && forwardEligible) return "forward";
  return null;
}

function finishGesture(): void {
  const dir = armedDirection();
  if (dir && Math.abs(dx) >= thresholdFor()) {
    ipcRenderer.send("gesture:navigate", dir);
  }
  dx = 0;
  dy = 0;
  hideIndicator();
}

window.addEventListener(
  "wheel",
  (e) => {
    if (e.ctrlKey) return; // pinch-zoom, not a swipe

    // A gesture only navigates if the page was already at its horizontal
    // scroll limit when it started (same rule as Chrome/Safari).
    if (dx === 0 && dy === 0) {
      const target = e.target instanceof Element ? e.target : null;
      const root = document.scrollingElement;
      const rootRight = root
        ? root.scrollWidth - root.clientWidth - root.scrollLeft
        : 0;
      backEligible =
        (root?.scrollLeft ?? 0) <= 0 && !ancestorCanScroll(target, "left");
      forwardEligible = rootRight <= 1 && !ancestorCanScroll(target, "right");
    }

    dx += e.deltaX;
    dy += e.deltaY;
    clearTimeout(endTimer);
    endTimer = setTimeout(finishGesture, GESTURE_END_MS);

    const dir = armedDirection();
    const progress = dir ? Math.abs(dx) / thresholdFor() : 0;
    if (dir && progress >= INDICATOR_MIN) showIndicator(dir, progress);
    else hideIndicator();
  },
  { passive: true, capture: true }
);

// Mouse side buttons (button 3 = back, 4 = forward).
window.addEventListener(
  "mouseup",
  (e) => {
    if (e.button === 3) ipcRenderer.send("gesture:navigate", "back");
    else if (e.button === 4) ipcRenderer.send("gesture:navigate", "forward");
  },
  { capture: true }
);
