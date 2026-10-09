// Tiny deterministic animation engine. A scene is { id, dur, html(), run(t, h) }.
// Every frame rebuilds the scene DOM and applies run(t), so any frame can be
// rendered in isolation — the web player loops it, the film renderer steps it.
(function () {
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const ease = {
    lin: (p) => p,
    out: (p) => 1 - Math.pow(1 - p, 3),
    in: (p) => p * p * p,
    io: (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2),
    back: (p) => { const c = 1.6; return 1 + (c + 1) * Math.pow(p - 1, 3) + c * Math.pow(p - 1, 2); },
  };
  const lerp = (a, b, p) => a + (b - a) * p;

  const CURSOR = '<svg class="ptr" viewBox="0 0 26 26"><path d="M5 2.5v19.2l5.1-4.9 3.3 7.4 3.4-1.5-3.3-7.3 7-.3z" fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg><div class="ripple"></div>';

  function helpers(root, t, scale) {
    const $ = (s) => root.querySelector(s);
    const $$ = (s) => [...root.querySelectorAll(s)];
    // eased progress of a segment [s, s + d]
    const k = (s, d, e = ease.io) => e(clamp((t - s) / d));
    const css = (el, o) => {
      if (typeof el === "string") el = $(el);
      if (!el) return;
      const tf = [];
      if (o.x != null || o.y != null) tf.push(`translate(${o.x || 0}px, ${o.y || 0}px)`);
      if (o.s != null) tf.push(`scale(${o.s})`);
      if (o.r != null) tf.push(`rotate(${o.r}deg)`);
      if (tf.length) el.style.transform = tf.join(" ");
      if (o.o != null) el.style.opacity = o.o;
      if (o.style) Object.assign(el.style, o.style);
    };
    // pop in at s, optionally out at e
    const show = (el, s, d = 0.35, from = { y: 10, s: 0.98 }, outAt = null, outD = 0.3) => {
      let p = k(s, d, ease.out);
      if (outAt != null) p = Math.min(p, 1 - k(outAt, outD, ease.in));
      css(el, { o: p, y: from.y != null ? lerp(from.y, 0, p) : null, s: from.s != null ? lerp(from.s, 1, p) : null });
      return p;
    };
    const typed = (str, s, cps = 20) => str.slice(0, Math.max(0, Math.floor((t - s) * cps)));
    // streamed text: reveals whole words at a steady rate
    const stream = (str, s, d) => {
      const words = str.split(/(\s+)/);
      const n = Math.floor(clamp((t - s) / d) * words.length);
      return words.slice(0, n).join("");
    };
    const caret = (on = true) => (on && Math.floor(t * 2.2) % 2 === 0 ? '<span class="caret"></span>' : on ? '<span class="caret" style="opacity:0"></span>' : "");
    // centre of an element in stage coordinates
    const at = (sel, dx = 0, dy = 0) => {
      const el = typeof sel === "string" ? $(sel) : sel;
      const r = el.getBoundingClientRect(), R = root.getBoundingClientRect();
      return { x: (r.left - R.left + r.width / 2) / scale + dx, y: (r.top - R.top + r.height / 2) / scale + dy };
    };
    // pointer path: frames [[time, {x,y} | selector | [selector, dx, dy]], ...], clicks [time, ...]
    const pointer = (frames, clicks = [], fadeOut = null) => {
      root.insertAdjacentHTML("beforeend", CURSOR);
      const cur = root.querySelector(".ptr"), rip = root.querySelector(".ripple");
      const pos = (f) => (typeof f === "string" ? at(f) : Array.isArray(f) ? at(f[0], f[1], f[2]) : f);
      if (t < frames[0][0] - 0.3) return;
      let p = pos(frames[0][1]);
      for (let i = 1; i < frames.length; i++) {
        const [t0] = frames[i - 1], [t1, f1] = frames[i];
        if (t >= t1) p = pos(f1);
        else if (t > t0) { const a = p, b = pos(f1), q = ease.io((t - t0) / (t1 - t0)); p = { x: lerp(a.x, b.x, q), y: lerp(a.y, b.y, q) }; break; }
        else break;
      }
      let o = k(frames[0][0] - 0.3, 0.3, ease.lin);
      if (fadeOut != null) o = Math.min(o, 1 - k(fadeOut, 0.3, ease.lin));
      let press = 1;
      for (const c of clicks) {
        const q = (t - c) / 0.5;
        if (q >= 0 && q <= 1) {
          css(rip, { o: 1 - q, s: lerp(0.3, 1.3, ease.out(q)), style: { left: p.x + "px", top: p.y + "px" } });
          press = 1 - 0.18 * Math.sin(Math.min(1, q * 2.5) * Math.PI);
        }
      }
      css(cur, { o, x: p.x - 5, y: p.y - 3, s: press });
    };
    // keystroke HUD: list of [time, ["⌥", "K"], "label"]
    const keys = (list) => {
      for (const [s, ks, label] of list) {
        if (t < s - 0.05 || t > s + 1.35) continue;
        root.insertAdjacentHTML("beforeend", `<div class="keys">${ks.map((x) => `<kbd>${x}</kbd>`).join("")}${label ? `<em>${label}</em>` : ""}</div>`);
        const all = root.querySelectorAll(".keys"), el = all[all.length - 1];
        const p = Math.min(k(s - 0.05, 0.22, ease.back), 1 - k(s + 1.05, 0.3, ease.in));
        el.style.opacity = clamp(p);
        el.style.transform = `translateX(-50%) translateY(${(1 - p) * 14}px) scale(${lerp(0.9, 1, clamp(p))})`;
        const kb = el.querySelectorAll("kbd");
        const down = clamp((t - s) / 0.18) < 1 && t >= s;
        kb.forEach((x) => { if (down) { x.style.transform = "translateY(2px)"; x.style.boxShadow = "0 0 0 #9ca3af"; } });
      }
    };
    return { t, $, $$, k, css, show, typed, stream, caret, at, pointer, keys, lerp, clamp, ease };
  }

  function renderInto(root, scene, t, scale) {
    root.innerHTML = scene.html();
    scene.run(t, helpers(root, t, scale));
  }

  // ---------- web player ----------
  function mount(box, scene, opts = {}) {
    box.classList.add("stage-box");
    box.innerHTML = '<div class="stage"></div>';
    const stage = box.firstChild;
    let scale = 1, t = 0, last = null, playing = false, visible = false, raf = 0;
    const HOLD = 1.4;
    const fit = () => { scale = box.clientWidth / 1280; stage.style.transform = `scale(${scale})`; renderInto(stage, scene, t, scale); };
    new ResizeObserver(fit).observe(box);
    const tick = (now) => {
      raf = 0;
      if (!playing || !visible) { last = null; return; }
      if (last != null) t += Math.min(0.1, (now - last) / 1000);
      last = now;
      if (t > scene.dur + HOLD) t = 0;
      renderInto(stage, scene, Math.min(t, scene.dur), scale);
      opts.onTime && opts.onTime(Math.min(t, scene.dur) / scene.dur);
      raf = requestAnimationFrame(tick);
    };
    const kick = () => { if (!raf && playing && visible) raf = requestAnimationFrame(tick); };
    new IntersectionObserver((es) => { visible = es[0].isIntersecting; kick(); }, { threshold: 0.25 }).observe(box);
    const api = {
      play() { playing = true; kick(); opts.onState && opts.onState(true); },
      pause() { playing = false; opts.onState && opts.onState(false); },
      toggle() { playing ? api.pause() : api.play(); },
      restart() { t = 0; api.play(); },
      seek(f) { t = f * scene.dur; renderInto(stage, scene, t, scale); opts.onTime && opts.onTime(f); },
      get playing() { return playing; },
    };
    fit();
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) api.play();
    // Reduced motion: show a still frame and offer Play, not Pause.
    else { api.seek(0.6); opts.onState && opts.onState(false); }
    return api;
  }

  window.Demo = { ease, clamp, lerp, helpers, renderInto, mount, scenes: [] };
})();
