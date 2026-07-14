#!/usr/bin/env node
/**
 * Download a Chrome Web Store extension and install it for ibe:
 *
 *   node scripts/install-chrome-extension.mjs <webstore-id> <name>
 *   node scripts/install-chrome-extension.mjs ophjlpahpchlmihnnnihgmmeilfjmjjc line
 *
 * Installs to ~/Library/Application Support/ibe/extensions/<name>/ where the
 * main process loads it at startup (src/main/extensions.ts).
 *
 * Electron can't run MV3 service workers, so this patches the unpacked copy
 * to work as a pane-hosted page instead:
 *   - strips `background` from the manifest (ibe opens the UI page directly)
 *   - injects chrome-shim.js before the app bundle in every top-level .html,
 *     stubbing the chrome.* APIs Electron doesn't provide (notifications ->
 *     HTML5 Notification, windows/tabs/cookies/downloads/action -> no-ops)
 * Best effort: extensions whose core logic lives in the service worker will
 * still not work.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

/** Read a protobuf varint at `i`; returns [value, nextIndex]. */
function varint(b, i) {
  let r = 0, s = 0;
  for (;;) {
    const x = b[i++];
    r += (x & 0x7f) * 2 ** s;
    if (!(x & 0x80)) return [r, i];
    s += 7;
  }
}

/** Length-delimited (wt 2) and varint (wt 0) fields at top level of `buf`. */
function protoFields(buf) {
  const out = [];
  let i = 0;
  while (i < buf.length) {
    const [tag, j] = varint(buf, i);
    const field = tag >>> 3, wire = tag & 7;
    i = j;
    if (wire === 2) {
      const [len, k] = varint(buf, i);
      out.push([field, buf.subarray(k, k + len)]);
      i = k + len;
    } else if (wire === 0) {
      const [, k] = varint(buf, i);
      i = k;
    } else break;
  }
  return out;
}

/** Chrome extension id: sha256(pubkey) first 16 bytes, each nibble → a–p. */
function idFromKey(pubkey) {
  const d = createHash("sha256").update(pubkey).digest().subarray(0, 16);
  let s = "";
  for (const b of d) s += String.fromCharCode(97 + (b >> 4), 97 + (b & 0xf));
  return s;
}

/** From a CRX3 buffer, the AsymmetricKeyProof public key whose id === want. */
function extractMatchingKey(crx, want) {
  if (crx.subarray(0, 4).toString() !== "Cr24") return null;
  const headerLen = crx.readUInt32LE(8);
  const header = crx.subarray(12, 12 + headerLen);
  for (const [field, val] of protoFields(header)) {
    if (field !== 2 && field !== 3) continue; // sha256_with_rsa / _with_ecdsa
    for (const [f2, v2] of protoFields(val)) {
      if (f2 === 1 && idFromKey(v2) === want) return v2.toString("base64");
    }
  }
  return null;
}

const [id, name] = process.argv.slice(2);
if (!id || !name || !/^[a-p]{32}$/.test(id) || !/^[a-z0-9-]+$/i.test(name)) {
  console.error("usage: install-chrome-extension.mjs <32-char webstore id> <name>");
  process.exit(1);
}

const destRoot =
  process.platform === "darwin"
    ? join(homedir(), "Library", "Application Support", "ibe", "extensions")
    : join(homedir(), ".config", "ibe", "extensions");
const dest = join(destRoot, name);

const crxUrl =
  "https://clients2.google.com/service/update2/crx?response=redirect" +
  "&prodversion=130.0.0.0&acceptformat=crx2,crx3" +
  `&x=id%3D${id}%26uc`;

console.log(`downloading ${id} …`);
const res = await fetch(crxUrl);
if (!res.ok) {
  console.error(`download failed: HTTP ${res.status}`);
  process.exit(1);
}
const crx = Buffer.from(await res.arrayBuffer());

// --- recover the developer public key so Electron computes the SAME extension
// id (origin) as Chrome. Extensions like LINE gate features on their origin
// (a hardcoded allowlist), so a mismatched unpacked id breaks them. The CRX3
// header carries the signing key(s); pick the one whose sha256 → `id`. ---
const devKeyB64 = extractMatchingKey(crx, id);
if (!devKeyB64) {
  console.warn(
    "warning: could not recover the signing key; the extension id will differ " +
      "from Chrome and origin-gated features may not work"
  );
}

// CRX3 = header + plain ZIP; find the ZIP local-file signature and unzip from there
const zipStart = crx.indexOf(Buffer.from("PK\x03\x04", "binary"));
if (zipStart < 0) {
  console.error("not a CRX/ZIP file");
  process.exit(1);
}
const tmpZip = join(tmpdir(), `ibe-ext-${id}.zip`);
writeFileSync(tmpZip, crx.subarray(zipStart));
rmSync(dest, { recursive: true, force: true });
mkdirSync(dest, { recursive: true });
execFileSync("unzip", ["-oq", tmpZip, "-d", dest]);
rmSync(tmpZip, { force: true });
rmSync(join(dest, "_metadata"), { recursive: true, force: true });

// --- patch manifest: no service worker (Electron can't run it) ---
const manifestPath = join(dest, "manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
delete manifest.background;
if (devKeyB64) manifest.key = devKeyB64; // pin the id/origin to match Chrome
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

// --- chrome.* shim for APIs Electron doesn't implement ---
const shim = String.raw`// injected by ibe: stubs for chrome.* APIs Electron doesn't implement
(() => {
  const c = window.chrome;
  if (!c) return;
  const ev = () => ({ addListener() {}, removeListener() {}, hasListener: () => false });
  const dual = (value) => (...args) => {
    const cb = typeof args[args.length - 1] === "function" ? args.pop() : null;
    if (cb) cb(value);
    return Promise.resolve(value);
  };
  const def = (obj, key, val) => { try { if (!obj[key]) obj[key] = val; } catch {} };

  def(c, "notifications", {
    create: (id, opts, cb) => {
      const o = opts && typeof opts === "object" ? opts : id;
      try { new Notification(o?.title ?? "", { body: o?.message ?? "", icon: o?.iconUrl }); } catch {}
      const nid = typeof id === "string" ? id : String(Date.now());
      if (typeof cb === "function") cb(nid);
      return Promise.resolve(nid);
    },
    update: dual(false), clear: dual(true), getAll: dual({}),
    onClicked: ev(), onClosed: ev(), onButtonClicked: ev(), onShowSettings: ev(),
  });
  def(c, "windows", {
    getCurrent: dual({ id: 1, focused: true, state: "normal" }),
    getAll: dual([]), update: dual({}), remove: dual(undefined),
    create: (opts, cb) => { if (opts?.url) window.open(opts.url); return dual({ id: Date.now() })(cb); },
    onRemoved: ev(), onFocusChanged: ev(), onCreated: ev(),
  });
  def(c, "action", { setIcon: dual(undefined), setBadgeText: dual(undefined),
    setBadgeBackgroundColor: dual(undefined), setTitle: dual(undefined), onClicked: ev() });
  def(c, "cookies", { get: dual(null), getAll: dual([]), set: dual(null), remove: dual(null), onChanged: ev() });
  def(c, "downloads", {
    download: (opts, cb) => {
      if (opts?.url) { const a = document.createElement("a"); a.href = opts.url; a.download = opts.filename ?? ""; a.click(); }
      return dual(Date.now())(cb);
    },
    onChanged: ev(), onCreated: ev(),
  });
  if (!c.system) def(c, "system", {});
  def(c.system, "display", { getInfo: dual([{ bounds: { left: 0, top: 0, width: screen.width, height: screen.height } }]) });
  if (c.tabs) {
    try { c.tabs.getZoom = dual(1); } catch {}
    try { c.tabs.setZoom = dual(undefined); } catch {}
    def(c.tabs, "getCurrent", dual(undefined));
    def(c.tabs, "onRemoved", ev());
  }
  if (c.runtime) def(c.runtime, "getPlatformInfo", dual({ os: "mac", arch: "arm64", nacl_arch: "arm64" }));
})();
`;
writeFileSync(join(dest, "chrome-shim.js"), shim);

// inject the shim before any other script in every top-level html page
for (const f of readdirSync(dest)) {
  if (!f.endsWith(".html")) continue;
  const p = join(dest, f);
  const html = readFileSync(p, "utf8");
  if (html.includes("chrome-shim.js")) continue;
  writeFileSync(
    p,
    html.replace(/<head>/i, '<head><script src="/chrome-shim.js"></script>')
  );
}

console.log(`installed ${manifest.name ?? name} ${manifest.version ?? ""} -> ${dest}`);
console.log("restart ibe to load it");
