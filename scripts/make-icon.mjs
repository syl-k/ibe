#!/usr/bin/env node
/**
 * Rasterize build/icon.svg into the macOS app icon (build/icon.icns) plus a PNG
 * used for OS notifications (build/icon.png). No native SVG tooling required —
 * Electron renders the SVG, then macOS `sips`/`iconutil` assemble the .icns.
 *
 *   npm run icon    (see package.json)
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const buildDir = join(root, "build");
const svg = readFileSync(join(buildDir, "icon.svg"), "utf8");
const electron = join(root, "node_modules", ".bin", "electron");

// --- 1. render SVG → 1024px PNG via a headless Electron window ---
const png1024 = join(buildDir, "icon-1024.png");
const renderer = join(tmpdir(), "ibe-icon-render.js");
writeFileSync(
  renderer,
  `const { app, BrowserWindow } = require("electron");
   const fs = require("fs");
   app.disableHardwareAcceleration();
   app.whenReady().then(async () => {
     const win = new BrowserWindow({
       width: 1024, height: 1024, show: false,
       webPreferences: { offscreen: true },
       transparent: true, frame: false,
     });
     const svg = ${JSON.stringify(svg)};
     await win.loadURL("data:image/svg+xml;base64," + Buffer.from(svg).toString("base64"));
     await new Promise((r) => setTimeout(r, 400));
     const img = await win.webContents.capturePage();
     fs.writeFileSync(${JSON.stringify(png1024)}, img.toPNG());
     app.exit(0);
   });`
);
execFileSync(electron, [renderer], { stdio: "inherit" });
rmSync(renderer, { force: true });

// --- 2. build the .iconset (all sizes macOS wants) ---
const iconset = mkdtempSync(join(tmpdir(), "ibe-icns-"));
const variants = [
  [16, "16x16"], [32, "16x16@2x"], [32, "32x32"], [64, "32x32@2x"],
  [128, "128x128"], [256, "128x128@2x"], [256, "256x256"], [512, "256x256@2x"],
  [512, "512x512"], [1024, "512x512@2x"],
];
for (const [px, name] of variants) {
  execFileSync("sips", ["-z", String(px), String(px), png1024, "--out", join(iconset, `icon_${name}.png`)], { stdio: "ignore" });
}
// rename to the .iconset directory layout iconutil requires
execFileSync("mv", [iconset, `${iconset}.iconset`]);
execFileSync("iconutil", ["-c", "icns", `${iconset}.iconset`, "-o", join(buildDir, "icon.icns")]);

// --- 3. a 512px PNG for OS notifications ---
execFileSync("sips", ["-z", "512", "512", png1024, "--out", join(buildDir, "icon.png")], { stdio: "ignore" });

rmSync(`${iconset}.iconset`, { recursive: true, force: true });
rmSync(png1024, { force: true });
console.log("wrote build/icon.icns and build/icon.png");
