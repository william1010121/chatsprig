# ChatSprig showcase site

A static feature guide (modelled on a classic extension manual: colour-grouped side
navigation, one card per feature) where every feature has a live, looping demo, plus
a 1080p tour video rendered from the same demos.

- `index.html`, `site.css`, `site.js` — the guide page. Open it directly or serve the folder.
- `demos/engine.js` — tiny deterministic animation engine (`scene.run(t)` renders any frame).
- `demos/scenes.js` — the 14 feature scenes (mock ChatGPT/Gemini UI, no real account data).
- `film.html` — 1920×1080 composition: intro, four parts, 14 chapters, outro. Opening it plays it live.
- `media/chatsprig-demo.mp4` — final tour (2:47, H.264, with soundtrack); `chatsprig-demo-silent.mp4` has no audio.
- `media/music/komiku-chill-out-theme.ogg` — soundtrack: Komiku, “Chill Out Theme”, [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/), via [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Komiku_-_02_-_Chill_Out_Theme.ogg).
- `media/settings.png` — screenshot of the real options page.

## Re-render the video

Needs Playwright's Chrome for Testing (`~/Library/Caches/ms-playwright/chromium-1217`) and ffmpeg.

```bash
node tools/render-film.mjs media/chatsprig-demo-silent.mp4 30      # ~4 min, frame-by-frame over CDP
node tools/render-film.mjs --stills /tmp/stills 10 42 90            # spot-check single frames
node tools/snap.mjs /tmp/snaps overlay:3 btw:7                      # single scene frames at 1280×760
```

Then add the score: `tools/make-score.sh media/chatsprig-demo-silent.mp4 media/chatsprig-demo.mp4`

## Deploy

The site runs at <https://chatsprig.driseam.com/> from the `flux-k8s` repo (`apps/base/chatsprig`).
Build and push a new image, then bump the tag in `apps/base/chatsprig/deployment.yaml`:

```bash
git lfs pull
docker buildx build --platform linux/amd64 \
  -t registry.driseam.com/chatsprig/site:<yyyymmdd>-<sha>-site --push web
```
