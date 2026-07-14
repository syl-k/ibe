import { ipcRenderer } from "electron";

/**
 * Password capture / autofill, injected into every browser pane (part of the
 * browser-pane preload, sandboxed isolated world). Talks to the main process
 * over pw:* channels — see src/main/passwords.ts. The plaintext password lives
 * only here (closure) and in main transiently; it is persisted (encrypted) only
 * after the user confirms the save banner.
 *
 * Heuristics, deliberately simple and Chrome-ish:
 *  - a "login submission" = form submit, Enter in a password field, or a click
 *    on a plausible submit control while a filled password field exists
 *  - username = the text/email/tel field just before the password field
 */

interface Captured {
  username: string;
  password: string;
}

let lastCaptured: Captured | null = null;

/* --- field discovery --- */

function passwordFields(): HTMLInputElement[] {
  return Array.from(
    document.querySelectorAll<HTMLInputElement>('input[type="password"]')
  ).filter((el) => el.offsetParent !== null || el.value); // visible or filled
}

function usernameFor(pw: HTMLInputElement): HTMLInputElement | null {
  const inputs = Array.from(document.querySelectorAll<HTMLInputElement>("input"));
  const pwIndex = inputs.indexOf(pw);
  const isUserish = (el: HTMLInputElement) => {
    const t = (el.type || "text").toLowerCase();
    if (["text", "email", "tel"].indexOf(t) < 0) return false;
    const hint = `${el.name} ${el.id} ${el.autocomplete}`.toLowerCase();
    return el.autocomplete !== "off" || /user|email|login|account|mail/.test(hint);
  };
  // nearest userish input before the password field, else the first one
  for (let i = pwIndex - 1; i >= 0; i--) if (isUserish(inputs[i])) return inputs[i];
  return inputs.find(isUserish) ?? null;
}

function captureFromDom(): Captured | null {
  const pw = passwordFields().find((el) => el.value);
  if (!pw) return null;
  const user = usernameFor(pw);
  return { username: user?.value ?? "", password: pw.value };
}

let lastReportAt = 0;
let lastReportKey = "";
function reportSubmission(): void {
  const cap = captureFromDom();
  if (!cap || !cap.password) return;
  lastCaptured = cap;
  // submit + click can both fire for one login — coalesce identical reports
  const now = Date.now();
  const k = `${cap.username} ${cap.password}`;
  if (k === lastReportKey && now - lastReportAt < 1500) return;
  lastReportKey = k;
  lastReportAt = now;
  ipcRenderer.send("pw:submitted", {
    url: location.href,
    username: cap.username,
    password: cap.password,
  });
}

/* --- submission signals --- */

window.addEventListener("submit", reportSubmission, { capture: true });

window.addEventListener(
  "keydown",
  (e) => {
    if (
      e.key === "Enter" &&
      e.target instanceof HTMLInputElement &&
      e.target.type === "password"
    ) {
      reportSubmission();
    }
  },
  { capture: true }
);

window.addEventListener(
  "click",
  (e) => {
    const el = e.target as Element | null;
    if (!el) return;
    const btn = el.closest(
      'button, input[type="submit"], input[type="button"], [role="button"]'
    );
    if (btn && passwordFields().some((p) => p.value)) reportSubmission();
  },
  { capture: true }
);

/* --- autofill --- */

function fillCredential(cred: Captured): void {
  const pw = passwordFields()[0] ?? document.querySelector<HTMLInputElement>('input[type="password"]');
  if (!pw) return;
  const setValue = (el: HTMLInputElement, value: string) => {
    if (!value || el.value) return; // never clobber what the user typed
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )?.set;
    setter?.call(el, value);
    // frameworks (React/Vue) listen for these to sync their state
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  };
  const user = usernameFor(pw);
  if (user) setValue(user, cred.username);
  setValue(pw, cred.password);
}

let filled = false;
async function tryAutofill(): Promise<void> {
  if (filled) return;
  try {
    const creds: Captured[] = await ipcRenderer.invoke("pw:query", location.href);
    if (!creds || !creds.length) return;
    if (!document.querySelector('input[type="password"]')) return;
    fillCredential(creds[0]); // most-recently-updated first (main sorts)
    filled = true;
  } catch {
    /* no fill is fine */
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", tryAutofill);
} else {
  tryAutofill();
}
// login forms often mount after load (SPA) — retry a few times, then give up
let tries = 0;
const retry = setInterval(() => {
  if (filled || tries++ > 10) return clearInterval(retry);
  tryAutofill();
}, 500);

/* --- save banner (shadow DOM so page CSS can't touch it) --- */

function showSaveBanner(origin: string, username: string, update: boolean): void {
  if (!lastCaptured) return;
  const password = lastCaptured.password;
  const user = username || lastCaptured.username;

  document.getElementById("ibe-pw-banner")?.remove();
  const host = document.createElement("div");
  host.id = "ibe-pw-banner";
  host.style.cssText =
    "position:fixed;top:12px;right:12px;z-index:2147483647;all:initial";
  (document.documentElement || document.body).appendChild(host);
  const root = host.attachShadow({ mode: "closed" });

  const site = origin.replace(/^https?:\/\//, "");
  const wrap = document.createElement("div");
  wrap.innerHTML = `
    <style>
      .card{font:13px -apple-system,system-ui,sans-serif;color:#1c1c1e;background:#fff;
        border:1px solid #d0d0d5;border-radius:12px;box-shadow:0 6px 24px rgba(0,0,0,.18);
        width:320px;padding:14px 16px}
      .t{font-weight:600;margin-bottom:6px}
      .s{color:#555;margin-bottom:10px;word-break:break-all}
      .u{color:#333;margin-bottom:12px;font-weight:500}
      .row{display:flex;gap:8px;justify-content:flex-end}
      button{font:inherit;padding:6px 12px;border-radius:8px;border:1px solid #c8c8cd;
        background:#f5f5f7;color:#1c1c1e;cursor:pointer}
      button.primary{background:#0a84ff;border-color:#0a84ff;color:#fff}
      button.link{border:none;background:none;color:#8a8a8e;margin-right:auto;padding:6px 4px}
    </style>
    <div class="card">
      <div class="t">${update ? "パスワードを更新しますか？" : "パスワードを保存しますか？"}</div>
      <div class="s">${site}</div>
      ${user ? `<div class="u">${user.replace(/[<>&]/g, "")}</div>` : ""}
      <div class="row">
        <button class="link" data-act="never">使わない</button>
        <button data-act="dismiss">後で</button>
        <button class="primary" data-act="save">${update ? "更新" : "保存"}</button>
      </div>
    </div>`;
  root.appendChild(wrap);

  const close = () => host.remove();
  const timer = setTimeout(close, 20000); // auto-dismiss
  root.querySelectorAll("button").forEach((b) =>
    b.addEventListener("click", () => {
      clearTimeout(timer);
      const act = (b as HTMLElement).dataset.act;
      if (act === "save") {
        ipcRenderer.send("pw:save", { origin, username: user, password });
      } else if (act === "never") {
        ipcRenderer.send("pw:never", { origin, username: user });
      }
      close();
    })
  );
}

ipcRenderer.on("pw:prompt", (_e, p: { origin: string; username: string; update: boolean }) => {
  showSaveBanner(p.origin, p.username, p.update);
});
