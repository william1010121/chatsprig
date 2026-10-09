// node tools/snap.mjs out-dir id:t id:t ...
import { launch } from "./cdp.mjs";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
const [out, ...specs] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const b = await launch({ port: 9461 });
await b.goto("file://" + resolve(new URL("../demos/preview.html", import.meta.url).pathname));
for (const s of specs) {
  const [id, t] = s.split(":");
  const r = await b.evaluate(`show(${JSON.stringify(id)}, ${t})`);
  if (r !== "ok") console.log(id, t, r);
  writeFileSync(`${out}/${id}-${t}.png`, await b.shot());
}
b.close();
