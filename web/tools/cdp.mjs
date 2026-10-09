// Minimal CDP driver for Chrome for Testing (headless).
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CHROME = `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1217/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;

export async function launch({ width = 1280, height = 760, port = 9455, args = [] } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "cs-film-"));
  const proc = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${dir}`, `--window-size=${width},${height}`,
    "--hide-scrollbars", "--force-device-scale-factor=1", "--allow-file-access-from-files", "--autoplay-policy=no-user-gesture-required", ...args, "about:blank"], { stdio: "ignore" });
  let targets;
  for (let i = 0; i < 80; i++) {
    try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (targets.find((x) => x.type === "page")) break; } catch {}
    await new Promise((r) => setTimeout(r, 150));
  }
  const page = targets.find((x) => x.type === "page");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0; const pending = new Map(); const listeners = [];
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { const { res, rej } = pending.get(d.id); pending.delete(d.id); d.error ? rej(new Error(d.error.message)) : res(d.result); } else listeners.forEach((f) => f(d)); };
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
  await send("Page.enable"); await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
  const evaluate = async (expr) => { const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };
  const goto = async (url) => { const load = new Promise((r) => listeners.push((d) => d.method === "Page.loadEventFired" && r())); await send("Page.navigate", { url }); await load; };
  const shot = async (fmt = "png", quality) => Buffer.from((await send("Page.captureScreenshot", { format: fmt, quality, optimizeForSpeed: true })).data, "base64");
  const close = () => { try { ws.close(); } catch {} proc.kill("SIGKILL"); };
  return { send, evaluate, goto, shot, close };
}
