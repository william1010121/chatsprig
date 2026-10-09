// Render web/film.html frame-by-frame into an H.264 MP4.
// node tools/render-film.mjs out.mp4 [fps] [from] [to]   |  node tools/render-film.mjs --stills dir t1 t2 ...
import { launch } from "./cdp.mjs";
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const args = process.argv.slice(2);
const b = await launch({ width: 1920, height: 1080, port: 9471 });
await b.goto("file://" + resolve(new URL("../film.html", import.meta.url).pathname) + "?render");
const frame = (t) => b.evaluate(`renderAt(${t}); Promise.all([...document.images].map(i => i.decode().catch(() => {}))).then(() => 1)`);
const duration = await b.evaluate("FILM_DURATION");

if (args[0] === "--stills") {
  mkdirSync(args[1], { recursive: true });
  for (const t of args.slice(2)) { await frame(+t); writeFileSync(`${args[1]}/f-${t}.png`, await b.shot()); }
  b.close(); process.exit(0);
}

const [out, fps = 30, from = 0, to = duration] = [args[0], +(args[1] || 30), +(args[2] || 0), +(args[3] || duration)];
const ff = spawn("ffmpeg", ["-loglevel", "error", "-y", "-f", "image2pipe", "-framerate", String(fps), "-c:v", "mjpeg", "-i", "-",
  "-c:v", "libx264", "-preset", "slow", "-crf", "16", "-pix_fmt", "yuv420p", "-movflags", "+faststart", out], { stdio: ["pipe", "inherit", "inherit"] });
const N = Math.round((to - from) * fps);
const t0 = Date.now();
for (let i = 0; i < N; i++) {
  await frame(from + i / fps);
  const buf = await b.shot("jpeg", 95);
  if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once("drain", r));
  if (i % 300 === 0) console.log(`frame ${i}/${N}  ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}
ff.stdin.end();
await new Promise((r) => ff.on("close", r));
b.close();
console.log("done", out, duration.toFixed(1) + "s");
