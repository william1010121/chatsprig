// Every ChatSprig feature as a deterministic scene (see engine.js).
(function () {
  const { ease, lerp, clamp } = Demo;

  // ---------- icons ----------
  const I = {
    sprig: (s = 18, c = "#174d3b", l = "#faf7ef") => `<svg width="${s}" height="${s}" viewBox="0 0 24 24"><path d="M12 2.8c-5.3 0-9.2 3.6-9.2 8.3 0 2.3 1 4.3 2.6 5.8l-1.1 4.3 4.5-2.2c1 .3 2.1.5 3.2.5 5.3 0 9.2-3.6 9.2-8.4S17.3 2.8 12 2.8z" fill="${c}"/><path d="M11.4 15.6v-2.8c0-2.4-1.5-4-4.4-4.1.2 2.5 1.8 4 4.4 4.1zM12.6 15.6v-3.4c0-2.9 1.8-4.9 5-5-.1 3-1.9 4.9-5 5z" fill="${l}"/></svg>`,
    x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    re: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/></svg>',
    tgt: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="6"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/></svg>',
    plus: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
    up: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>',
    copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="8" y="8" width="12" height="12" rx="2.5"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>',
    thumb: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M7 11v9H4v-9zM7 11l4-7c1.5 0 2.5 1 2.2 2.6L12.6 10H19a2 2 0 0 1 2 2.3l-1.2 6A2 2 0 0 1 17.8 20H7"/></svg>',
    share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M7 8l5-5 5 5M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5"/></svg>',
    spark: (s = 18, g = true) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24"><defs><linearGradient id="gg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4285f4"/><stop offset=".55" stop-color="#9b72cb"/><stop offset="1" stop-color="#d96570"/></linearGradient></defs><path d="M12 2c.6 5.3 4.7 9.4 10 10-5.3.6-9.4 4.7-10 10-.6-5.3-4.7-9.4-10-10 5.3-.6 9.4-4.7 10-10z" fill="${g ? "url(#gg)" : "currentColor"}"/></svg>`,
    doc: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M12 11v6M9 14h6"/></svg>',
    gear: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
    branch: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="6" cy="5" r="2.2"/><circle cx="6" cy="19" r="2.2"/><circle cx="18" cy="8" r="2.2"/><path d="M6 7.2v9.6M18 10.2c0 4-6 3-11 6.6"/></svg>',
    check: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    chat: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M21 12a8.5 8.5 0 0 1-12.4 7.6L3 21l1.4-5.4A8.5 8.5 0 1 1 21 12z"/></svg>',
    gpt: (s = 20) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M12 3.5l7.4 4.25v8.5L12 20.5l-7.4-4.25v-8.5z"/><path d="M12 3.5v8.5l7.4 4.25M12 12l-7.4 4.25"/></svg>`,
    pen: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>',
    chev: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 9l6 6 6-6"/></svg>',
  };

  // ---------- shared fragments ----------
  const browser = (url, inner) => `<div class="bw"><div class="bw-bar"><div class="bw-dots"><i></i><i></i><i></i></div>
    <div class="bw-url"><svg width="13" height="13" viewBox="0 0 24 24" fill="#5f6368"><path d="M7 10V7a5 5 0 0 1 10 0v3h1a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1zm2 0h6V7a3 3 0 0 0-6 0z"/></svg>${url}</div>
    <div class="bw-ext">${I.sprig(20, "#faf7ef", "#174d3b")}</div></div><div class="bw-view">${inner}</div></div>`;

  const ARTICLE = `<div class="art"><div class="art-in">
    <div class="art-top">${I.sprig(16)} Field notes · Atmospheric science</div>
    <h1>Aurora</h1><div class="lede">From a field guide to the night sky · 8 min read</div>
    <div class="fig"></div><div class="cap">Green curtains of aurora over a northern lake.</div>
    <p>An aurora is a natural light display in the sky, seen most often in high-latitude regions. Auroras appear as shifting curtains, rays, spirals or flickers of light that cover the entire sky.</p>
    <p>They are produced when the magnetosphere is disturbed by the solar wind. Charged particles, mainly electrons and protons, are steered along field lines and precipitate into the upper atmosphere, where their energy is lost to the gas.</p>
    <p>The resulting ionization and excitation of atmospheric constituents emits light of varying colour and complexity. The form of the aurora depends on the amount of acceleration imparted to the precipitating particles.</p>
  </div></div>`;

  const Q1 = "Why are auroras mostly green?";
  const A1 = "Most auroral light comes from oxygen atoms about 100–250 km up. When electrons from the solar wind strike them, oxygen is excited and relaxes by emitting light at 557.7 nm — a vivid green. Higher up, where the air is thinner, oxygen glows red, while nitrogen adds blue and purple at the lower edge.";
  const GQ = "Summarize that in one line.";
  const GA = "Auroras look green because oxygen atoms 100–250 km up, excited by solar-wind electrons, emit light at 557.7 nm.";

  const cmp = (txt = "", ph = "Ask anything", sendOff = false) => `<div class="cmp"><div class="plus">${I.plus}</div><div class="txt" data-ph="${ph}">${txt}</div><div class="send${sendOff ? " off" : ""}">${I.up}</div></div>`;
  const cgEmpty = (title = "Temporary chat", sub = "This chat won't appear in your history.") =>
    `<div class="cg-empty"><h3>${title}</h3><p>${sub}</p>${cmp()}</div>`;
  const cgThread = (inner) => `<div class="thread"><div class="thread-in">${inner}</div></div><div class="dock-cmp">${cmp()}</div>`;
  const gmEmpty = () => `<div class="gm-empty"><div class="gm-badge">${I.spark(14)} Temporary chat</div><div class="gm-hi">Hello, there</div>
    <div class="gm-cmp"><div class="txt"></div><div class="mdl">Flash ▾</div></div></div>`;
  const gmThread = (q) => `<div class="thread"><div class="thread-in"><div class="gm-bub">${q}</div><div class="gm-ans"><div class="spark">${I.spark(22)}</div><div class="ga"></div></div></div></div>
    <div class="dock-cmp"><div class="gm-cmp"><div class="txt"></div><div class="mdl">Flash ▾</div></div></div>`;

  const overlay = ({ title = "ChatSprig · Temporary Chat", body = "", rail = "" } = {}) => `<div class="dim"></div>${rail}
    <div class="ov"><div class="ov-head">${I.sprig(17, "#faf7ef", "#111827")}<div class="t">${title}</div><div class="ic">${I.tgt}</div><div class="ic rf">${I.re}</div><div class="ic">${I.x}</div></div>
    <div class="ov-body">${body}</div><div class="ov-foot"><span>Alt+K ChatGPT · Alt+G Gemini · Alt+N new chat</span><span>◇ focus input</span></div></div>`;
  const rail = (items, top = 190) => `<div class="rail" style="left:164px;top:${top}px">${items
    .map((it) => (it === "-" ? "<hr>" : `<b class="${it.cls || ""}" data-k="${it.k}" style="--chip:${it.chip || ""}">${it.html}</b>`))
    .join("")}</div>`;
  const RAIL2 = [{ k: "cg", html: I.gpt(20) }, { k: "gm", html: I.spark(18, false) }];

  const SIDE_ROWS = ["Aurora colors explained", "Kyoto trip plan", "Fourier series notes", "Sourdough hydration", "Rust lifetimes, again"];
  const app = (main, { rows = SIDE_ROWS, cur = 0, title = "ChatGPT" } = {}) => `<div class="app"><div class="side">
      <div class="side-h">${I.gpt(22)} <span style="flex:1"></span>${I.pen}</div>
      <div class="side-btn">${I.pen} New chat</div><div class="side-btn"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg> Search chats</div>
      <div class="side-lbl">Chats</div>
      ${rows.map((r, i) => `<div class="row${i === cur ? " cur" : ""}" style="top:${170 + i * 38}px"><span class="nm">${r}</span></div>`).join("")}
    </div><div class="main"><div class="main-h"><span class="mh-btn" style="display:flex;align-items:center;gap:6px">${title} ${I.chev}</span></div>${main}</div></div>`;

  // overlay open/close helper; returns openness
  const openOv = (h, s, e = null, d = 0.42) => {
    let p = h.k(s, d, ease.out);
    if (e != null) p *= 1 - h.k(e, 0.32, ease.in);
    h.css(".dim", { o: p });
    h.css(".ov", { o: p, s: lerp(0.94, 1, p), y: lerp(18, 0, p) });
    return p;
  };
  const showRail = (h, s, e = null) => {
    let p = h.k(s, 0.4, ease.out);
    if (e != null) p *= 1 - h.k(e, 0.3, ease.in);
    h.css(".rail", { o: p, x: lerp(14, 0, p) });
  };
  const toast = (h, html, s, e) => {
    h.$(".stage-toast") || h.$(".bw-view").insertAdjacentHTML("beforeend", `<div class="toast stage-toast">${I.check} ${html}</div>`);
    const p = Math.min(h.k(s, 0.3, ease.back), 1 - h.k(e, 0.3, ease.in));
    const el = h.$(".stage-toast");
    el.style.opacity = clamp(p);
    el.style.transform = `translateX(-50%) translateY(${(1 - clamp(p)) * -12}px)`;
  };
  const answer = (h, sel, text, s, d) => { const el = h.$(sel); if (el) el.textContent = h.stream(text, s, d); };
  const setCmp = (h, sel, html) => { const el = h.$(sel); if (el) el.innerHTML = html; };

  const S = [];

  // 1 ─ Floating chat on any page
  S.push({
    id: "overlay", dur: 9.6, group: "overlay", title: "Chat on any page",
    blurb: "Press Option+K and ChatGPT appears in a floating window over the page you are reading. Ask, read, press Option+K again — you never left.",
    keys: [["⌥", "K"]],
    html: () => browser("<b>fieldnotes.example</b>/sky/aurora", ARTICLE + overlay({ body: `<div class="cg layer e">${cgEmpty()}</div><div class="cg layer th" style="opacity:0">${cgThread(`<div class="bub">${Q1}</div><div class="ans"></div>`)}</div>` })),
    run(t, h) {
      h.keys([[1.0, ["⌥", "K"], "Open ChatGPT"], [3.75, ["⏎"], "Send"], [8.0, ["⌥", "K"], "Back to the page"]]);
      openOv(h, 1.15, 8.15);
      const sent = t >= 3.85;
      setCmp(h, ".e .txt", sent ? "" : h.typed(Q1, 1.9, 17) + h.caret(t > 1.5));
      h.css(".e", { o: 1 - h.k(3.85, 0.25) });
      h.css(".th", { o: h.k(3.85, 0.3) });
      h.css(".th .bub", { o: h.k(3.9, 0.3), y: lerp(12, 0, h.k(3.9, 0.3)) });
      answer(h, ".th .ans", A1, 4.4, 2.8);
    },
  });

  // 2 ─ Gemini + switching
  S.push({
    id: "gemini", dur: 9.2, group: "overlay", title: "ChatGPT and Gemini, side by side",
    blurb: "Option+G opens Gemini in a verified temporary chat; Option+K switches back. Each service keeps its own conversation and draft while hidden.",
    keys: [["⌥", "G"], ["⌥", "K"]],
    html: () => browser("<b>fieldnotes.example</b>/sky/aurora", ARTICLE + overlay({
      rail: rail(RAIL2),
      body: `<div class="cg layer c">${cgThread(`<div class="bub">${Q1}</div><div class="ans">${A1}</div>`)}</div><div class="gm layer g e">${gmEmpty()}</div><div class="gm layer g th" style="opacity:0">${gmThread(GQ)}</div>`,
    })),
    run(t, h) {
      h.keys([[1.1, ["⌥", "G"], "Switch to Gemini"], [4.0, ["⏎"], "Send"], [7.1, ["⌥", "K"], "Back to ChatGPT"]]);
      openOv(h, -1); showRail(h, -1);
      const g = h.k(1.25, 0.35) * (1 - h.k(7.25, 0.35));
      h.css(".c", { o: 1 - g });
      h.css(".g.e", { o: g * (1 - h.k(4.05, 0.25)) });
      h.css(".g.th", { o: g * h.k(4.05, 0.3) });
      setCmp(h, ".g.e .txt", t < 4.05 ? h.typed(GQ, 2.1, 16) : "");
      answer(h, ".g.th .ga", GA, 4.5, 1.8);
      h.$(".ov-head .t").textContent = g > 0.5 ? "ChatSprig · Gemini Temporary Chat" : "ChatSprig · Temporary Chat";
      h.$$(".rail b").forEach((b) => b.classList.toggle("on", (b.dataset.k === "gm") === g > 0.5));
      if (t > 7.6) toast(h, "Your ChatGPT conversation is still here", 7.6, 9.6);
    },
  });

  // 3 ─ Fresh temporary chat
  S.push({
    id: "newchat", dur: 6.2, group: "overlay", title: "A fresh temporary chat, instantly",
    blurb: "Option+N replaces only the current service with a brand-new temporary chat — even while the window is closed.",
    keys: [["⌥", "N"]],
    html: () => browser("<b>fieldnotes.example</b>/sky/aurora", ARTICLE + overlay({ body: `<div class="cg layer c">${cgThread(`<div class="bub">${Q1}</div><div class="ans">${A1}</div>`)}</div><div class="cg layer e" style="opacity:0">${cgEmpty()}</div>` })),
    run(t, h) {
      h.keys([[1.2, ["⌥", "N"], "New temporary chat"]]);
      openOv(h, -1);
      h.css(".rf svg", { r: h.k(1.25, 0.8, ease.out) * 360 });
      h.css(".c", { o: 1 - h.k(1.35, 0.35) });
      h.css(".e", { o: h.k(1.85, 0.4), y: lerp(10, 0, h.k(1.85, 0.4)) });
      setCmp(h, ".e .txt", t > 2.3 ? h.caret() : "");
      toast(h, "Fresh temporary chat — nothing saved to history", 2.5, 5.4);
    },
  });

  // 4 ─ Floating launcher
  const LAUNCH = `<div class="lc" style="position:absolute;right:26px;bottom:26px;width:52px;height:52px">
      <div class="lb lg" style="position:absolute;right:0;bottom:0;height:52px;border-radius:26px;background:#fff;color:#1f1f1f;box-shadow:0 6px 18px rgba(0,0,0,.18),0 0 0 1px #e5e7eb;display:flex;align-items:center;gap:8px;padding:0 15px;font-weight:600;font-size:14px;white-space:nowrap">${I.spark(22)}<span class="lt">Gemini</span></div>
      <div class="lb lc1" style="position:absolute;right:0;bottom:0;height:52px;border-radius:26px;background:#111827;color:#fff;box-shadow:0 6px 18px rgba(0,0,0,.25);display:flex;align-items:center;gap:8px;padding:0 15px;font-weight:600;font-size:14px;white-space:nowrap">${I.chat}<span class="lt">ChatGPT</span></div></div>`;
  S.push({
    id: "launcher", dur: 7.4, group: "overlay", title: "A launcher that stays out of the way",
    blurb: "Prefer the mouse? Hover the corner launcher and it fans out into ChatGPT and Gemini. Pick the corner, or hide it on ChatGPT itself.",
    keys: [],
    html: () => browser("<b>fieldnotes.example</b>/sky/aurora", ARTICLE + LAUNCH + overlay({ title: "ChatSprig · Gemini Temporary Chat", body: `<div class="gm layer">${gmEmpty()}</div>` })),
    run(t, h) {
      const ex = h.k(1.75, 0.4, ease.out) * (1 - h.k(3.65, 0.25));
      h.$$(".lt").forEach((x) => { x.style.maxWidth = ex * 80 + "px"; x.style.overflow = "hidden"; x.style.opacity = ex; });
      h.css(".lg", { x: -ex * 136 });
      openOv(h, 3.75);
      setCmp(h, ".gm-cmp .txt", t > 4.3 ? h.typed("What causes the red aurora?", 4.6, 17) : "");
      h.pointer([[0.4, { x: 900, y: 520 }], [1.5, ".lc1"], [2.4, ".lc1"], [3.2, ".lg"], [4.4, ".lg"], [5.2, { x: 1010, y: 640 }]], [3.4], 5.6);
    },
  });

  // 5 ─ Open-chats dock
  const RAIL5 = [{ k: "cg", html: I.gpt(20) }, { k: "gm", html: I.spark(18, false) }, "-", { k: "b1", cls: "chip", chip: "#10b981", html: "<span>R</span>" }, { k: "b2", cls: "chip", chip: "#f59e0b", html: "<span>W</span>" }];
  S.push({
    id: "dock", dur: 8.4, group: "overlay", title: "Every open chat, one click away",
    blurb: "A dock beside the window lists each live chat — ChatGPT, Gemini and your branches. Switching keeps every conversation and unsent draft.",
    keys: [],
    html: () => browser("<b>fieldnotes.example</b>/sky/aurora", ARTICLE + overlay({
      rail: rail(RAIL5, 160),
      body: `<div class="cg layer v0">${cgThread(`<div class="bub">${Q1}</div><div class="ans">${A1}</div>`)}</div>
        <div class="gm layer v1">${gmThread(GQ)}</div>
        <div class="cg layer v2">${cgThread(`<div class="bub">How is Rayleigh scattering different from Mie scattering?</div><div class="ans">Rayleigh scattering happens when particles are much smaller than the wavelength of light; its strength rises steeply as wavelength shrinks, which is why the sky is blue. Mie scattering comes from larger particles such as droplets and scatters all colours almost equally — clouds look white.</div>`)}</div>`,
    }) + `<div class="rail-tip"></div>`),
    run(t, h) {
      openOv(h, -1); showRail(h, -1);
      const v = t < 1.9 ? 0 : t < 4.1 ? 1 : t < 6.3 ? 2 : 0;
      [0, 1, 2].forEach((i) => h.css(".v" + i, { o: i === v ? 1 : 0 }));
      h.$(".v1 .ga").textContent = GA;
      h.$$(".rail b").forEach((b) => b.classList.toggle("on", b.dataset.k === ["cg", "gm", "b1"][v]));
      h.$(".ov-head .t").textContent = ["ChatSprig · Temporary Chat", "ChatSprig · Gemini Temporary Chat", "ChatSprig · Rayleigh vs. Mie scattering"][v];
      const tipFor = t < 2.4 ? ["gm", "Gemini", 1.2, 2.3] : t < 4.6 ? ["b1", "Branch · Rayleigh vs. Mie scattering", 3.4, 4.5] : ["cg", "ChatGPT", 5.6, 6.7];
      const tip = h.$(".rail-tip"), anchor = h.at(`.rail b[data-k="${tipFor[0]}"]`);
      tip.textContent = tipFor[1];
      Object.assign(tip.style, { left: anchor.x - 30 - tip.offsetWidth + "px", top: anchor.y - 15 + "px" });
      tip.style.opacity = Math.min(h.k(tipFor[2], 0.2), 1 - h.k(tipFor[3], 0.2));
      h.pointer([[0.4, { x: 420, y: 560 }], [1.4, '.rail b[data-k="gm"]'], [2.9, '.rail b[data-k="gm"]'], [3.7, '.rail b[data-k="b1"]'], [5.0, '.rail b[data-k="b1"]'], [5.9, '.rail b[data-k="cg"]']], [1.85, 4.05, 6.25]);
    },
  });

  // 6 ─ Ask in sidebar
  const SEL6 = "Excited oxygen emits light at 557.7 nm — a vivid green.";
  const ANS6 = `<div class="ans"><span class="hl">${SEL6}</span> Most of that glow comes from oxygen atoms about 100–250 km up, struck by electrons from the solar wind. Higher up, where the air is thinner, oxygen glows red, while nitrogen adds blue and purple at the lower edge.</div>`;
  S.push({
    id: "ask", dur: 9.8, group: "flow", title: "Ask in sidebar",
    blurb: "Select any text in a ChatGPT or Gemini answer and choose Ask in sidebar. Only that selection goes to the floating chat — your main conversation stays untouched.",
    keys: [],
    html: () => browser("<b>chatgpt.com</b>/c/aurora-colors", app(cgThread(`<div class="bub">${Q1}</div>${ANS6}`)) +
      `<div class="selpop"><span>${I.chat.replace('width="20" height="20"', 'width="15" height="15"')} Ask ChatGPT</span><span class="mine">${I.sprig(15)} Ask in sidebar</span></div>` +
      overlay({ body: `<div class="cg layer e">${cgEmpty()}</div><div class="cg layer th" style="opacity:0">${cgThread(`<div class="bub"><span class="q">${SEL6}</span>Why that exact wavelength?</div><div class="ans a2"></div>`)}</div>` })),
    run(t, h) {
      const sel = h.k(1.4, 1.1, ease.lin) * (1 - h.k(4.0, 0.2));
      h.$(".hl").style.backgroundSize = sel * 100 + "% 100%";
      const pop = h.$(".selpop"), a = h.at(".hl", 0, -46);
      const pp = h.k(2.65, 0.25, ease.out) * (1 - h.k(3.95, 0.15));
      Object.assign(pop.style, { left: a.x - 150 + "px", top: a.y - 74 + "px", opacity: pp, transform: `translateY(${(1 - pp) * 6}px)` });
      openOv(h, 4.1);
      const draft = t > 4.5 ? `<span class="q" style="display:block;border-left:3px solid #c9c9c9;padding-left:10px;color:#4b4b4b">${SEL6}</span>` + h.typed("Why that exact wavelength?", 4.9, 18) + h.caret() : "";
      setCmp(h, ".e .txt", t < 6.55 ? draft : "");
      h.keys([[6.4, ["⏎"], "Auto-send (optional)"]]);
      h.css(".e", { o: 1 - h.k(6.55, 0.25) });
      h.css(".th", { o: h.k(6.55, 0.3) });
      answer(h, ".a2", "557.7 nm is oxygen's “forbidden” green line: an excited state that lives for about 0.7 s before it decays. Only in the thin upper air do atoms survive that long without colliding, so the green glow appears there.", 7.0, 2.4);
      h.pointer([[0.3, { x: 780, y: 560 }], [1.3, [".hl", -212, 2]], [1.4, [".hl", -212, 2]], [2.5, [".hl", 214, 2]], [3.2, ".selpop .mine"], [4.4, ".selpop .mine"], [5.0, { x: 1080, y: 650 }]], [3.85], 5.2);
    },
  });

  // 7 ─ Explain with Gemini
  S.push({
    id: "explain", dur: 8.6, group: "flow", title: "Explain with Gemini",
    blurb: "Every ChatGPT answer gets a Gemini sparkle. One click sends the full response to Gemini with your prefix — a second opinion without copy-paste, and your clipboard stays as it was.",
    keys: [],
    html: () => browser("<b>chatgpt.com</b>/c/aurora-colors", app(cgThread(`<div class="bub">${Q1}</div><div class="ans">${A1}</div>
      <div class="acts"><i>${I.copy}</i><i>${I.thumb}</i><i style="transform:scaleY(-1)">${I.thumb}</i><i>${I.share}</i><i class="gx">${I.spark(18)}</i></div>`)) +
      `<div class="tip">explain with gemini</div>` +
      overlay({ title: "ChatSprig · Gemini Temporary Chat", body: `<div class="gm layer">${gmThread(`explain this to me\n\n${A1.slice(0, 118)}…`)}</div>` })),
    run(t, h) {
      const tip = h.$(".tip"), a = h.at(".gx", 0, -46);
      Object.assign(tip.style, { left: a.x - 70 + "px", top: a.y + 22 + "px", opacity: h.k(1.5, 0.2) * (1 - h.k(2.3, 0.15)) });
      h.$(".gx").style.background = t > 1.4 && t < 2.4 ? "#f0f0f0" : "";
      openOv(h, 2.45);
      h.css(".gm-bub", { o: h.k(2.9, 0.3) });
      answer(h, ".ga", "Think of the upper atmosphere as a giant neon sign. The Sun sends a stream of fast electrons; Earth's magnetic field funnels them toward the poles. When they hit oxygen high above us, the oxygen absorbs the energy and gives it back as green light — the colour of the aurora.", 3.5, 3.4);
      toast(h, "Full response sent · clipboard preserved", 3.0, 7.6);
      h.pointer([[0.3, { x: 800, y: 300 }], [1.3, ".gx"], [2.4, ".gx"], [3.0, { x: 1060, y: 680 }]], [2.2], 3.2);
    },
  });

  // 8 ─ /btw branches
  S.push({
    id: "btw", dur: 11.6, group: "flow", title: "/btw — side questions in a branch",
    blurb: "Type /btw and a question. ChatSprig branches the conversation natively and asks it in a floating window — the main thread never sees the detour.",
    keys: [["/", "b", "t", "w"]],
    html: () => browser("<b>chatgpt.com</b>/c/aurora-colors", app(cgThread(`<div class="bub">${Q1}</div><div class="ans">${A1}</div>`)) +
      `<div class="brs" style="left:775px;bottom:82px"><span class="pill">${I.branch} Branches · 1</span><span class="sp"></span><span class="rc">What does Rayleigh mean here?</span></div>
       <div class="menu" style="left:455px;bottom:84px"><div class="mh">Commands</div><div class="mi on">${I.branch}<code>/btw</code><em>Ask a side question in a branch</em></div><div class="mi" style="opacity:.55">${I.pen}<code>/search</code><em>Search the web</em></div></div>` +
      overlay({ title: "ChatSprig · Branch · What does Rayleigh mean here?", body: `<div class="cg layer">${cgThread(`<div style="text-align:center;color:#8f8f8f;font-size:12.5px;margin:0 0 18px">— Branched from “Aurora colors explained” · 2 messages copied —</div><div class="bub">What does Rayleigh mean here?</div><div class="ans a2"></div>`)}</div>` })),
    run(t, h) {
      const base = h.$(".main .dock-cmp .txt");
      const Q = "What does Rayleigh mean here?";
      let txt = "";
      if (t < 1.85) txt = h.typed("/b", 0.8, 6);
      else if (t < 4.55) txt = "/btw " + h.typed(Q, 2.3, 17);
      base.innerHTML = t > 0.5 ? txt + h.caret(t < 4.55) : "";
      const m = h.k(1.15, 0.2, ease.out) * (1 - h.k(1.85, 0.15));
      h.css(".menu", { o: m, y: (1 - m) * 6 });
      h.keys([[1.8, ["⏎"], "Complete /btw"], [4.5, ["⏎"], "Send to branch"], [9.4, ["⌥", "K"], "Close window"]]);
      openOv(h, 4.85, 9.55);
      answer(h, ".a2", "Here “Rayleigh” isn't quite the right word — Rayleigh scattering explains why the daytime sky is blue. Auroral colours come from emission: oxygen and nitrogen atoms releasing energy as light at specific wavelengths.", 5.6, 2.8);
      h.css(".brs", { o: h.k(5.2, 0.3), y: lerp(8, 0, h.k(5.2, 0.3)) });
      if (t > 9.8) { const p = 0.5 + 0.5 * Math.sin((t - 9.8) * 6); h.$(".brs .pill").style.boxShadow = `0 0 0 ${1 + p * 4}px rgba(23,77,59,${0.35 - p * 0.2})`; }
    },
  });

  // 9 ─ Branch popover
  S.push({
    id: "branches", dur: 8.0, group: "flow", title: "Branches, always within reach",
    blurb: "Hover Branches · N above the prompt for every branch of this conversation, newest first. Reloading the page reopens a branch without asking again.",
    keys: [],
    html: () => browser("<b>chatgpt.com</b>/c/aurora-colors", app(cgThread(`<div class="bub">${Q1}</div><div class="ans">${A1}</div>`)) +
      `<div class="brs" style="left:775px;bottom:82px;opacity:1"><span class="pill">${I.branch} Branches · 3</span><span class="sp"></span><span class="rc">Rayleigh vs. Mie scattering</span><span class="rc">Why 557.7 nm exactly?</span><span class="rc">Solar wind units</span></div>
       <div class="pop" style="left:455px;bottom:118px"><div class="mh" style="padding:6px 10px;font-size:12px;color:#8f8f8f">Branches of this chat</div>
        <div class="pi" data-i="0"><i style="--chip:#10b981"></i>Rayleigh vs. Mie scattering<small>2 min</small></div>
        <div class="pi" data-i="1"><i style="--chip:#f59e0b"></i>Why 557.7 nm exactly?<small>9 min</small></div>
        <div class="pi" data-i="2"><i style="--chip:#6366f1"></i>Solar wind units<small>1 h</small></div></div>` +
      overlay({ title: "ChatSprig · Why 557.7 nm exactly?", body: `<div class="cg layer">${cgThread(`<div class="bub">Why 557.7 nm exactly?</div><div class="ans">It is the energy gap between two levels of the oxygen atom — the ¹S → ¹D transition. Each photon carries exactly that energy, which our eyes see as green.</div>`)}</div>` })),
    run(t, h) {
      const p = h.k(1.45, 0.22, ease.out) * (1 - h.k(3.35, 0.15));
      h.css(".pop", { o: p, y: (1 - p) * 8 });
      h.$$(".pop .pi").forEach((x) => x.classList.toggle("on", x.dataset.i === "1" && t > 2.7));
      openOv(h, 3.45);
      h.pointer([[0.3, { x: 760, y: 420 }], [1.3, ".brs .pill"], [2.0, ".brs .pill"], [2.7, '.pop .pi[data-i="1"]'], [3.6, '.pop .pi[data-i="1"]'], [4.4, { x: 1080, y: 650 }]], [3.25], 4.6);
    },
  });

  // 10 ─ Sidebar branch tree + Clean
  const TREE = [
    { n: "Rayleigh vs. Mie scattering", f: 0, tr: 1, d: 1, del: 1 },
    { n: "Kyoto trip plan", f: 1, tr: 4, d: 0, af: 1 },
    { n: "Aurora colors explained", f: 2, tr: 0, d: 0, src: 1, af: 0 },
    { n: "Branch · Aurora colors explained", f: 3, tr: 2, d: 1, del: 1 },
    { n: "Fourier series notes", f: 4, tr: 5, d: 0, af: 2 },
    { n: "Solar wind units", f: 5, tr: 3, d: 2, del: 1 },
    { n: "Sourdough hydration", f: 6, tr: 6, d: 0, af: 3 },
  ];
  S.push({
    id: "tree", dur: 10.4, group: "flow", title: "A branch tree in your sidebar",
    blurb: "Branch chats nest under the conversation they came from — /btw branches and ChatGPT's own. Hover a source to Clean every branch below it in one go.",
    keys: [],
    html: () => browser("<b>chatgpt.com</b>/c/aurora-colors", `<div class="app"><div class="side" style="width:420px">
        <div class="side-h">${I.gpt(22)} <span style="flex:1"></span>${I.pen}</div>
        <div class="side-btn">${I.pen} New chat</div><div class="side-lbl">Chats</div>
        ${TREE.map((r, i) => `<div class="row${r.src ? " src" : ""}" data-i="${i}"><span class="guide"></span><span class="nm">${r.n}</span>${r.src ? '<span class="clean">Clean · 3</span>' : ""}</div>`).join("")}
      </div><div class="main"><div class="main-h">ChatGPT ${I.chev}</div>${cgThread(`<div class="bub">${Q1}</div><div class="ans">${A1}</div>`)}
      <div class="card cf" style="left:50%;top:200px;width:380px;margin-left:-190px"><div style="font-weight:600;font-size:17px;margin-bottom:6px">Delete 3 branch chats?</div>
        <div style="color:#5d5d5d;font-size:14px;margin-bottom:18px">Every branch below “Aurora colors explained”, including branches of branches. The source conversation is kept.</div>
        <div style="display:flex;justify-content:flex-end;gap:8px"><span style="padding:8px 14px;border-radius:999px;box-shadow:0 0 0 1px #d4d4d4;font-size:14px">Cancel</span><span class="del" style="padding:8px 14px;border-radius:999px;background:#d92d20;color:#fff;font-size:14px;font-weight:600">Delete</span></div></div></div></div>`),
    run(t, h) {
      const nest = h.k(1.0, 1.1);
      const gone = h.k(6.75, 0.6);
      h.$$(".row").forEach((el) => {
        const r = TREE[+el.dataset.i];
        let y = lerp(r.f, r.tr, nest);
        if (r.af != null) y = lerp(y, r.af, gone);
        const ind = r.d * 22 * nest;
        el.style.top = 130 + y * 40 + "px";
        el.style.paddingLeft = 10 + ind + "px";
        const g = el.querySelector(".guide");
        g.style.left = 10 + ind - 13 + "px"; g.style.opacity = r.d ? nest : 0;
        if (r.del) el.style.opacity = 1 - gone;
        if (r.src && t > 3.4 && t < 7.6) el.style.background = "#ececec";
      });
      const cl = h.k(3.9, 0.25, ease.out) * (1 - h.k(7.3, 0.25));
      h.css(".clean", { o: cl, x: (1 - cl) * 8 });
      const cf = h.k(4.75, 0.3, ease.out) * (1 - h.k(6.55, 0.2));
      h.css(".cf", { o: cf, s: lerp(0.95, 1, cf) });
      toast(h, "Deleted 3 branch chats · source kept", 7.3, 10.6);
      h.pointer([[0.3, { x: 700, y: 520 }], [3.4, [".row.src", -60, 0]], [4.1, ".clean"], [4.6, ".clean"], [5.6, ".cf .del"], [6.6, ".cf .del"], [7.4, { x: 760, y: 560 }]], [4.55, 6.45], 7.6);
    },
  });

  // 11 ─ Skills
  const SK = [["system-prompt", "Insert your saved system prompt"], ["summarize", "Summarize the text below in 5 bullets"], ["translate-zh", "Translate into Traditional Chinese, keep terms"], ["eli5", "Explain it like I'm five"], ["review", "Review this code for bugs and edge cases"]];
  const TPL = "Translate the following into Traditional Chinese. Keep technical terms in English.\n\n";
  S.push({
    id: "skills", dur: 8.6, group: "write", title: "Skills: prompts on //",
    blurb: "Save text templates in Settings, then type // in any ChatGPT or Gemini prompt to search and insert one. It lands as an editable draft — nothing is sent.",
    keys: [["/", "/"]],
    html: () => browser("<b>chatgpt.com</b>", app(`<div class="cg-empty" style="top:-60px"><h3>What's on your mind today?</h3><p style="margin:0 0 18px"></p><div class="cw" style="position:relative">${cmp("", "Ask anything")}
      <div class="menu" style="left:0;top:66px;width:640px"><div class="mh">Skills</div>${SK.map(([n, d]) => `<div class="mi" data-n="${n}"><code>//${n}</code><em>${d}</em></div>`).join("")}</div></div></div>`)),
    run(t, h) {
      let txt = "";
      const q = t < 2.1 ? "" : h.typed("tr", 2.1, 7);
      if (t < 3.05) txt = (t > 0.7 ? h.typed("//", 0.8, 6) : "") + q;
      else txt = TPL.replace(/\n/g, "<br>") + h.typed("Temporary chats keep your history clean.", 4.3, 18);
      setCmp(h, ".cmp .txt", txt + (t > 0.5 ? h.caret() : ""));
      const m = h.k(1.15, 0.2, ease.out) * (1 - h.k(3.0, 0.15));
      h.css(".menu", { o: m, y: (1 - m) * 6 });
      h.$$(".menu .mi").forEach((el) => {
        const show = !q || el.dataset.n.includes(q);
        el.style.display = show ? "" : "none";
      });
      const vis = h.$$(".menu .mi").filter((x) => x.style.display !== "none");
      vis.forEach((x, i) => x.classList.toggle("on", i === 0));
      h.keys([[2.95, ["⏎"], "Insert skill"]]);
      toast(h, "Inserted as an editable draft — nothing sent", 3.3, 6.6);
    },
  });

  // 12 ─ System prompt
  S.push({
    id: "sysprompt", dur: 10.2, group: "write", title: "Your system prompt, on a schedule",
    blurb: "Turn on Append system prompt from the model picker and ChatSprig adds your saved instructions in verified Chat mode — on the first message, or every k messages.",
    keys: [],
    html: () => browser("<b>chatgpt.com</b>/c/notes", app(cgThread(`<div class="bub">Plan a 3-day Kyoto itinerary.</div><div class="ans">Day 1 — Higashiyama: Kiyomizu-dera at opening time, then down Sannenzaka to Yasaka Shrine…</div>`), { cur: 1 }) +
      `<div class="picker" style="left:290px;top:96px"><div class="seg"><span class="on">Chat</span><span>Work</span></div>
        <div class="md on">Instant <small>Answers right away</small></div><div class="md">Thinking <small>Thinks longer</small></div>
        <div class="pfoot"><div class="tg"><span class="sw"></span>Compact view</div><div class="sqb">${I.doc}</div></div></div>
       <div class="tip">Append system prompt · On</div>
       <div class="card spc" style="right:34px;top:84px;width:390px"><h6>Settings → System prompt</h6>
        <div class="mono" style="background:#f6f7f8;border-radius:10px;padding:10px 12px;font-size:13px;line-height:1.55;margin-bottom:12px">Answer concisely. Use metric units.<br>Cite sources when you state facts.</div>
        <div style="display:flex;align-items:center;justify-content:space-between;font-size:14px"><span>Repeat every <b>k</b> user messages</span> <span style="font:600 15px ui-monospace,monospace;padding:4px 12px;border-radius:8px;box-shadow:0 0 0 1px #d4d4d4">3</span></div></div>
       <div class="card seq" style="left:300px;right:34px;bottom:30px;padding:16px 20px"><h6>Which messages get the instructions (k = 3)</h6><div class="msgs" style="display:flex;gap:10px;margin-top:10px">
        ${[1, 2, 3, 4, 5, 6, 7, 8].map((n) => `<div class="m" style="flex:1;text-align:center"><div style="height:38px;border-radius:12px;background:#f4f4f4;display:grid;place-items:center;font-weight:600">#${n}</div><div class="sp" style="margin-top:6px;font-size:11.5px;font-weight:600;color:#174d3b;${(n - 1) % 3 ? "visibility:hidden" : ""}">+ prompt</div></div>`).join("")}</div></div>`),
    run(t, h) {
      const pk = h.k(0.95, 0.25, ease.out) * (1 - h.k(3.0, 0.2));
      h.css(".picker", { o: pk, y: (1 - pk) * -6 });
      h.$(".sqb").classList.toggle("on", t > 2.05);
      const tip = h.$(".tip"), a = h.at(".sqb", 0, -46);
      Object.assign(tip.style, { left: a.x - 90 + "px", top: a.y + 26 + "px", opacity: h.k(2.1, 0.2) * (1 - h.k(2.9, 0.2)) });
      h.show(".spc", 3.3, 0.4, { x: 0, y: 12 });
      h.show(".seq", 4.4, 0.4, { y: 16 });
      h.$$(".msgs .m").forEach((m, i) => {
        const p = h.k(4.9 + i * 0.42, 0.3, ease.out);
        m.style.opacity = p; m.style.transform = `translateY(${(1 - p) * 8}px)`;
        if (i % 3 === 0 && p > 0.5) m.firstChild.style.background = "#e3f1e9";
      });
      h.pointer([[0.2, { x: 700, y: 400 }], [0.8, ".mh-btn"], [1.2, ".mh-btn"], [1.9, ".sqb"], [2.6, ".sqb"], [3.3, { x: 760, y: 470 }]], [1.0, 2.0], 3.4);
    },
  });

  // 13 ─ Compact view
  const LONG = `<div class="cv"><p>Auroras form where the solar wind meets Earth's magnetic field. The field channels charged particles toward the poles, into an oval-shaped band around each magnetic pole.</p>
    <p>Colour depends on which gas is hit and how high:</p><ul><li>Green — oxygen, 100–250 km</li><li>Red — oxygen, above 250 km</li><li>Blue and violet — nitrogen, below 100 km</li></ul>
    <p>Strong geomagnetic storms push the oval toward the equator, which is why auroras are occasionally seen far from the Arctic.</p></div>`;
  S.push({
    id: "compact", dur: 10.6, group: "read", title: "Compact view for long reads",
    blurb: "Tune ChatGPT for reading: live sliders for line, paragraph and list spacing plus side margins. Choices sync across tabs and apply inside the floating window too.",
    keys: [],
    html: () => browser("<b>chatgpt.com</b>/c/aurora-colors", `<div class="app"><div class="main"><div class="main-h"><span class="mh-btn" style="display:flex;align-items:center;gap:6px">ChatGPT ${I.chev}</span></div>
      <div class="thread" style="bottom:0"><div class="ans" style="margin:0 auto">${LONG}</div></div></div></div>
      <div class="picker" style="left:24px;top:96px"><div class="seg"><span class="on">Chat</span><span>Work</span></div><div class="md on">Instant <small>Answers right away</small></div><div class="md">Thinking <small>Thinks longer</small></div>
        <div class="pfoot"><div class="tg cvt"><span class="sw"></span>Compact view<span class="gr" style="margin-left:auto;color:#6b6b6b">${I.gear}</span></div><div class="sqb">${I.doc}</div></div></div>
      <div class="cvp" style="right:28px;top:78px"><h5>Compact view <span>On</span></h5>
        ${[["lh", "Line spacing"], ["pg", "Paragraph spacing"], ["li", "List item spacing"], ["mg", "Side margins"]].map(([k, l]) => `<div class="sl s-${k}"><div class="lab">${l}<b></b></div><div class="tr"><i></i><u></u></div></div>`).join("")}
        <div style="font-size:12.5px;color:#174d3b;font-weight:600;text-align:right">Reset</div></div>`),
    run(t, h) {
      const on = h.k(2.3, 0.7);
      const lh = t < 5.4 ? 1.65 : t < 6.8 ? lerp(1.65, 2.15, h.k(5.4, 1.2)) : lerp(2.15, 1.45, h.k(6.8, 1.0));
      const mg = lerp(12, 22, h.k(8.6, 1.0));
      const ans = h.$(".ans"), W = 1280;
      const off = { lh: 1.75, pg: 16, li: 6, w: 640 };
      const pg = lerp(off.pg, 8, on), li = lerp(off.li, 3, on);
      const width = lerp(off.w, W * (1 - (2 * mg) / 100), on);
      Object.assign(ans.style, { width: width + "px", lineHeight: lerp(off.lh, lh, on), fontSize: "16.5px" });
      h.$$(".cv p").forEach((p) => (p.style.margin = `0 0 ${pg}px`));
      h.$$(".cv li").forEach((p) => (p.style.margin = `0 0 ${li}px`));
      h.$(".cv ul").style.margin = `0 0 ${pg}px`;
      const pk = h.k(1.05, 0.25, ease.out) * (1 - h.k(4.25, 0.2));
      h.css(".picker", { o: pk, y: (1 - pk) * -6 });
      h.$(".cvt .sw").style.cssText = t > 2.3 ? "background:#174d3b;--k:13px" : "";
      h.show(".cvp", 4.35, 0.35, { y: -8 });
      const vals = { lh: [lh, 1.2, 2.4, lh.toFixed(2)], pg: [8, 0, 24, "8px"], li: [3, 0, 12, "3px"], mg: [mg, 0, 25, Math.round(mg) + "%"] };
      for (const key in vals) {
        const [v, a, b, s] = vals[key], f = ((v - a) / (b - a)) * 100;
        h.$(`.s-${key} i`).style.width = f + "%"; h.$(`.s-${key} u`).style.left = f + "%"; h.$(`.s-${key} b`).textContent = s;
      }
      h.pointer([[0.3, { x: 700, y: 420 }], [0.8, ".mh-btn"], [1.1, ".mh-btn"], [2.0, [".cvt", -40, 0]], [2.5, [".cvt", -40, 0]], [3.4, ".cvt .gr"], [4.3, ".cvt .gr"], [5.0, ".s-lh u"], [7.9, ".s-lh u"], [8.4, ".s-mg u"], [9.8, ".s-mg u"], [10.4, { x: 1000, y: 520 }]], [1.0, 2.3, 4.15]);
    },
  });

  // 14 ─ Copy LaTeX
  S.push({
    id: "latex", dur: 8.4, group: "read", title: "Copy math as LaTeX",
    blurb: "Copy a formula from ChatGPT and you get clean LaTeX source with \\( \\) and \\[ \\] delimiters — ready for Overleaf, Notion or your notes.",
    keys: [["⌘", "C"]],
    html: () => browser("<b>chatgpt.com</b>/c/calculus", app(cgThread(`<div class="bub">Area under y = x² from 0 to 1?</div>
      <div class="ans hlb">The area is the definite integral of <span class="mi-math">x</span><sup>2</sup> over [0, 1]:
      <div class="fx"><span class="int">∫</span><span class="lim"><span>1</span><span>0</span></span> x<sup style="font-size:15px">2</sup> d<i>x</i> = <span class="frac"><span>1</span><span>3</span></span></div>
      so the average height of the curve on that interval is also <span class="frac" style="font-size:15px"><span>1</span><span>3</span></span>.</div>`), { cur: 2 }) +
      `<div class="card c1" style="left:330px;bottom:30px;width:400px;padding:14px 18px"><h6 style="color:#b42318">Default copy</h6><div class="mono" style="color:#6b7280">The area is the definite integral of x2 over [0, 1]:<br>∫01x2dx=31<br>so the average height … is also 31.</div></div>
       <div class="card c2" style="right:30px;bottom:30px;width:480px;padding:14px 18px"><h6 style="color:#174d3b">Copied with ChatSprig</h6><div class="mono">The area is the definite integral of \\(x^2\\) over [0, 1]:<br>\\[\\int_0^1 x^2\\,dx = \\frac{1}{3}\\]<br>so the average height … is also \\(\\frac{1}{3}\\).</div></div>`),
    run(t, h) {
      h.$(".hlb").style.backgroundSize = `100% ${h.k(0.9, 1.2, ease.lin) * 100}%`;
      h.keys([[2.4, ["⌘", "C"], "Copy"]]);
      h.show(".c1", 2.9, 0.4, { y: 18 });
      h.show(".c2", 3.6, 0.45, { y: 18 });
      if (t > 4.2) h.$(".c1").style.opacity = lerp(1, 0.55, h.k(4.2, 0.5));
      h.pointer([[0.2, { x: 760, y: 200 }], [0.8, [".hlb", -300, -60]], [0.9, [".hlb", -300, -60]], [2.1, [".hlb", 250, 60]], [2.8, { x: 1000, y: 330 }]], [], 3.0);
    },
  });

  Demo.scenes = S;
  Demo.byId = Object.fromEntries(S.map((s) => [s.id, s]));
  Demo.icons = I;
})();
