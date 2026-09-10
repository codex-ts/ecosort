/* EcoSort v3 — shared site shell: nav state, theme, mode badge, toast, service worker */
(function () {
  const $ = (sel) => document.querySelector(sel);

  /* Active nav link from body[data-page] */
  try {
    const page = document.body.dataset.page || "";
    document.querySelectorAll(".topnav a").forEach((a) => {
      if (a.dataset.nav === page) {
        a.classList.add("active");
        a.setAttribute("aria-current", "page");
      }
    });
  } catch {}

  /* Theme (persisted) */
  try {
    const theme = localStorage.getItem("ecosort-theme") || "light";
    document.documentElement.dataset.theme = theme;
    const tb = $("#themeBtn");
    if (tb) {
      tb.textContent = theme === "dark" ? "☀️" : "🌙";
      tb.onclick = () => {
        const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
        document.documentElement.dataset.theme = next;
        try { localStorage.setItem("ecosort-theme", next); } catch {}
        tb.textContent = next === "dark" ? "☀️" : "🌙";
      };
    }
  } catch {}

  /* Global toast */
  window.toast = function (msg) {
    const t = $("#toast");
    if (!t) return;
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(t._h);
    t._h = setTimeout(() => t.classList.remove("show"), 2200);
  };

  /* Mode badge: probe backend health, explain on click */
  let live = false;
  fetch("/api/health", { method: "GET" })
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => {
      if (j && j.live) {
        live = true;
        const b = $("#modeBadge");
        if (b) {
          b.textContent = "Live AI";
          b.classList.remove("mode-demo");
          b.classList.add("mode-live");
        }
        const hint = $("#uzHint");
        if (hint) hint.textContent = "Live AI connected — your photo is analysed by a Claude vision model.";
      }
    })
    .catch(() => {});
  const badge = $("#modeBadge");
  if (badge) {
    badge.onclick = () => {
      alert(live
        ? "LIVE AI MODE\n\nBackend connected. Requests use a real Claude vision/chat model."
        : "DEMO MODE\n\nFully offline, no key, no cost. Answers from the curated SWM 2016 knowledge base.\n\nFor real AI vision: set ANTHROPIC_API_KEY and run node server.js.");
    };
  }

  /* Offline support */
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
})();
