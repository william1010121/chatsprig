(() => {
  const ICON = {
    pause: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>',
    play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13l11-6.5z"/></svg>',
    replay: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12a8 8 0 1 0 2.3-5.7"/><path d="M4 4v5h5"/></svg>',
  };

  // Animated demos with play / replay / scrub controls
  document.querySelectorAll(".demo[data-scene]").forEach((box) => {
    const scene = Demo.byId[box.dataset.scene];
    if (!scene) return;
    const ctl = document.createElement("div");
    ctl.className = "ctl";
    ctl.innerHTML = `<button class="pp" title="Pause">${ICON.pause}</button><button class="rp" title="Replay">${ICON.replay}</button><div class="prog"><i></i></div><span class="lbl">${scene.dur.toFixed(0)}s demo</span>`;
    box.parentElement.after(ctl);
    const bar = ctl.querySelector(".prog i"), pp = ctl.querySelector(".pp");
    const api = Demo.mount(box, scene, {
      onTime: (f) => (bar.style.width = f * 100 + "%"),
      onState: (on) => { pp.innerHTML = on ? ICON.pause : ICON.play; pp.title = on ? "Pause" : "Play"; },
    });
    pp.onclick = () => api.toggle();
    ctl.querySelector(".rp").onclick = () => api.restart();
    ctl.querySelector(".prog").onclick = (e) => { const r = e.currentTarget.getBoundingClientRect(); api.pause(); api.seek((e.clientX - r.left) / r.width); };
    box.style.cursor = "pointer";
    box.onclick = () => api.toggle();
  });

  // Alt → Option on Apple platforms
  if (/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)) document.querySelectorAll('kbd[data-key="alt"]').forEach((k) => (k.textContent = "Option"));

  // Scroll spy for the side navigation
  const links = [...document.querySelectorAll(".nav a")];
  const map = new Map(links.map((a) => [a.getAttribute("href").slice(1), a]));
  const spy = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { links.forEach((a) => a.classList.remove("on")); const a = map.get(e.target.id); if (a) { a.classList.add("on"); a.scrollIntoView({ block: "nearest" }); } }
  }, { rootMargin: "-40% 0px -55% 0px" });
  map.forEach((_, id) => { const el = document.getElementById(id); if (el) spy.observe(el); });

  document.getElementById("up").onclick = () => scrollTo({ top: 0, behavior: "smooth" });
  document.getElementById("down").onclick = () => scrollTo({ top: document.documentElement.scrollHeight, behavior: "smooth" });
  addEventListener("keydown", (e) => { if (e.key === "Escape" && document.activeElement?.tagName !== "INPUT") scrollTo({ top: 0, behavior: "smooth" }); });
})();
