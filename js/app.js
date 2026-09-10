/* EcoSort v3 — multi-page app logic.
   Each module guards on its DOM, so every page loads knowledge.js + site.js + app.js
   and only runs what it needs. Impact history persists in localStorage across pages. */

const state = { items: 0, recycled: 0, co2: 0, live: false, history: [] };
let currentResult = null;
const LS_KEY = "ecosort-v2";
const QUIZ_BEST_KEY = "ecosort-quiz-best";
const OPEN_KEY = "ecosort-open";

const $ = (sel) => document.querySelector(sel);
function escapeHTML(s) { const d = document.createElement("div"); d.textContent = String(s == null ? "" : s); return d.innerHTML; }
function toast(msg) { if (typeof window.toast === "function") window.toast(msg); }

const verdictLabel = {
  yes: "RECYCLABLE", compost: "COMPOSTABLE", no: "NOT RECYCLABLE",
  special: "SPECIAL DISPOSAL", conditional: "CHECK LOCALLY", reuse: "REUSE / DONATE",
};
const verdictClass = {
  yes: "v-yes", compost: "v-compost", no: "v-no",
  special: "v-special", conditional: "v-conditional", reuse: "v-reuse",
};
const CO2MAP = { yes: 0.3, compost: 0.5, reuse: 0.8, special: 0.2, conditional: 0.1, no: 0 };

function saveState() {
  try { localStorage.setItem(LS_KEY, JSON.stringify({ items: state.items, recycled: state.recycled, co2: state.co2, history: state.history.slice(-20) })); } catch {}
}
function loadState() {
  try {
    const j = JSON.parse(localStorage.getItem(LS_KEY) || "null");
    if (!j) return;
    state.items = j.items || 0; state.recycled = j.recycled || 0; state.co2 = j.co2 || 0;
    state.history = j.history || [];
  } catch {}
}

/* Backend probe for routing (badge UI lives in site.js) */
async function detectBackend() {
  try {
    const r = await fetch("/api/health", { method: "GET" });
    if (r.ok) {
      const j = await r.json();
      if (j.live) state.live = true;
    }
  } catch {}
}

/* ---------- matching ---------- */
function matchKeyword(text) {
  const t = (text || "").toLowerCase();
  for (const row of KEYWORD_INDEX) {
    if (row.keys.some((k) => t.includes(k.trim()))) return row.id;
  }
  return null;
}
function searchItems(q, verdict) {
  const t = (q || "").toLowerCase().trim();
  return Object.entries(WASTE_DB).filter(([id, d]) => {
    if (verdict && verdict !== "all" && d.recyclable !== verdict) return false;
    if (!t) return true;
    const keys = (KEYWORD_INDEX.find((k) => k.id === id) || { keys: [] }).keys.join(" ");
    const hay = (d.name + " " + d.category + " " + d.bin + " " + keys).toLowerCase();
    return t.split(/\s+/).every((w) => hay.includes(w));
  });
}

/* Deep-link: library/home cards open the item on the Classify page */
function openItem(id) {
  try { sessionStorage.setItem(OPEN_KEY, id); } catch {}
  location.href = "classify.html";
}

/* ---------- impact (shared) ---------- */
function levelFor(n) {
  if (n >= 25) return ["🏆 Eco Champion", 25, 50];
  if (n >= 12) return ["🌳 Eco Leader", 12, 25];
  if (n >= 5) return ["🌿 Eco Doer", 5, 12];
  return ["🌱 Eco Beginner", 0, 5];
}
function setText(id, txt) { const el = $(id); if (el) el.textContent = txt; }
function refreshImpactUI() {
  setText("#statItems", String(state.items));
  setText("#statRecycled", String(state.recycled));
  setText("#statCo2", state.co2.toFixed(1) + " kg");
  const [label, lo, hi] = levelFor(state.items);
  setText("#levelBadge", label);
  const fill = $("#levelFill");
  if (fill) fill.style.width = Math.min(100, Math.round(((state.items - lo) / Math.max(1, hi - lo)) * 100)) + "%";
  setText("#levelNext", state.items >= 25 ? "max level" : (hi - state.items) + " to next level");
  const trees = (state.co2 / 21).toFixed(1);
  const km = Math.round(state.co2 * 4.5);
  setText("#equivLine", state.items === 0
    ? "Sort your first item to start your streak."
    : "≈ " + trees + " tree-years of CO₂ or ~" + km + " km not driven by car. Estimates, not precision claims.");
  const h = $("#historyList");
  if (h) {
    h.innerHTML = state.history.length === 0
      ? '<li class="hist-empty">No items yet — sort something on the Classify page.</li>'
      : state.history.slice().reverse().map((x) => "<li><span>" + escapeHTML(x.emoji) + "</span><div><b>" + escapeHTML(x.name) + "</b><small>" + escapeHTML(x.bin) + " · " + escapeHTML(x.when) + "</small></div></li>").join("");
  }
  /* Home progress strip */
  setText("#homeItems", String(state.items));
  setText("#homeLevel", label);
  const hb = $("#homeBar");
  if (hb) hb.style.width = Math.min(100, Math.round(((state.items - lo) / Math.max(1, hi - lo)) * 100)) + "%";
}
function updateImpact(data) {
  state.items += 1;
  if (["yes", "compost", "reuse", "special"].includes(data.recyclable)) state.recycled += 1;
  state.co2 += CO2MAP[data.recyclable] ?? 0;
  try {
    state.history.push({ emoji: data.emoji, name: data.name, bin: data.bin, when: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) });
  } catch { state.history.push({ emoji: data.emoji, name: data.name, bin: data.bin, when: "" }); }
  state.history = state.history.slice(-20);
  saveState();
  refreshImpactUI();
}

/* ---------- result (Classify page) ---------- */
function renderResult(data) {
  currentResult = data;
  if ($("#resultPanel")) {
    $("#rEmoji").textContent = data.emoji || "♻️";
    $("#rName").textContent = data.name;
    $("#rCategory").textContent = data.category;
    const v = $("#rVerdict");
    v.textContent = verdictLabel[data.recyclable] || "REVIEW";
    v.className = "rc-verdict " + (verdictClass[data.recyclable] || "v-conditional");
    $("#rBinDot").style.background = data.binColor || "#888";
    $("#rBinName").textContent = data.bin;
    $("#rConf").textContent = Math.round((data.confidence || 0.9) * 100) + "%";
    $("#rPrep").innerHTML = (data.prep || []).map((p) => "<li>" + escapeHTML(p) + "</li>").join("");
    $("#rCo2").textContent = data.co2 || "";
    $("#rDecompose").textContent = data.decompose || "";
    $("#rTip").textContent = data.tip || "";
    $("#rSource").textContent = data.__source === "model"
      ? "Source: live Claude vision model · confidence reported by the model."
      : "Source: EcoSort knowledge base (SWM 2016 rules) · demo mode.";
    $("#resultPanel").hidden = false;
    $("#resultPanel").scrollIntoView({ behavior: "smooth", block: "center" });
  }
  updateImpact(data);
}
function classifyById(id) {
  const d = WASTE_DB[id];
  if (!d) return;
  renderResult({ ...d, __source: "kb" });
}
async function classifyImage(file) {
  const reader = new FileReader();
  reader.onload = async (e) => {
    const pv = $("#preview");
    if (pv) { pv.src = e.target.result; pv.hidden = false; }
    if (state.live) {
      try {
        const r = await fetch("/api/classify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image: e.target.result }),
        });
        const j = await r.json();
        if (!j.error) { renderResult({ ...j, __source: "model" }); return; }
      } catch {}
    }
    const guess = matchKeyword(String(file.name || "").replace(/[._-]+/g, " "));
    if (guess) classifyById(guess);
    else {
      renderResult({
        ...WASTE_DB.plastic_bottle, confidence: 0.55, __source: "kb",
        tip: "Demo mode can't see inside the image — it matched by filename. Search or browse the library for an exact match, or connect Live AI for real photo analysis.",
      });
    }
  };
  reader.readAsDataURL(file);
}
function quickSearch() {
  const inp = $("#qInput");
  if (!inp) return;
  const id = matchKeyword(inp.value);
  if (id) classifyById(id);
  else toast("No match — try 'battery', 'pizza', 'flowers', or browse the library.");
}

/* ---------- library ---------- */
function renderLibrary() {
  const grid = $("#libraryGrid");
  if (!grid) return;
  const q = $("#searchInput") ? $("#searchInput").value : "";
  const f = $("#filterVerdict") ? $("#filterVerdict").value : "all";
  const list = searchItems(q, f);
  setText("#libCount", list.length + " items");
  grid.innerHTML = list.map(([id, d]) =>
    '<button class="lib-card" data-id="' + id + '"><span class="lib-emoji">' + d.emoji + '</span><div><b>' + escapeHTML(d.name) + "</b><small>" + escapeHTML(d.bin) + '</small></div><span class="lib-pill ' + verdictClass[d.recyclable] + '">' + verdictLabel[d.recyclable] + "</span></button>"
  ).join("") || '<p class="lib-empty">No matches. Try "bottle", "oil", "flowers".</p>';
  grid.querySelectorAll("button").forEach((b) => { b.onclick = () => openItem(b.dataset.id); });
}

/* ---------- bins ---------- */
function renderBins() {
  const g = $("#binGrid");
  if (!g || typeof BIN_GUIDE === "undefined") return;
  g.innerHTML = BIN_GUIDE.map((b) =>
    '<div class="bin-card"><span class="bin-dot" style="background:' + b.color + '"></span><div><b>' + escapeHTML(b.name) + "</b><p>" + escapeHTML(b.items) + "</p><small>" + escapeHTML(b.tip) + "</small></div></div>"
  ).join("");
  const dd = $("#dosDonts");
  if (dd) {
    dd.innerHTML =
      '<div class="dd-col"><h4>Always do</h4><ul><li>Keep dry waste clean and dry</li><li>Wrap sanitary waste and label it</li><li>Tape battery terminals, use drop-offs</li><li>Compost food, leaves, and flowers</li></ul></div>' +
      '<div class="dd-col"><h4>Never do</h4><ul><li>No batteries or bulbs in any bin</li><li>No soft plastic in curbside bins</li><li>No ceramic in glass recycling</li><li>No paint or oil down drains</li></ul></div>';
  }
}

/* ---------- quiz ---------- */
const quizState = { i: 0, score: 0, started: false };
function quizBest() { try { return Number(localStorage.getItem(QUIZ_BEST_KEY) || 0); } catch { return 0; } }
function renderQuiz() {
  const Q = $("#quizQ");
  if (!Q || typeof QUIZ === "undefined") return;
  const opts = $("#quizOpts"), why = $("#quizWhy"), score = $("#quizScore");
  setText("#quizBest", "Best: " + quizBest() + "/" + QUIZ.length);
  if (!quizState.started) { Q.textContent = "Press Start to begin."; opts.innerHTML = ""; why.textContent = ""; if (score) score.textContent = ""; return; }
  if (quizState.i >= QUIZ.length) {
    Q.textContent = "Done! You scored " + quizState.score + "/" + QUIZ.length + ".";
    opts.innerHTML = "";
    why.textContent = quizState.score === QUIZ.length ? "Flawless — ready for review questions." : "Replay to lock the tricky ones: pizza box, CFL, milk pouch.";
    if (score) score.textContent = "";
    try { if (quizState.score > quizBest()) localStorage.setItem(QUIZ_BEST_KEY, String(quizState.score)); } catch {}
    setText("#quizBest", "Best: " + quizBest() + "/" + QUIZ.length);
    const st = $("#quizStart"); if (st) st.textContent = "Replay quiz";
    quizState.started = false; quizState.i = 0;
    return;
  }
  const item = QUIZ[quizState.i];
  Q.textContent = "Q" + (quizState.i + 1) + "/" + QUIZ.length + " · " + item.q;
  why.textContent = "";
  if (score) score.textContent = "Score " + quizState.score;
  opts.innerHTML = item.options.map((o, idx) => "<button data-i=\"" + idx + "\">" + escapeHTML(o) + "</button>").join("");
  opts.querySelectorAll("button").forEach((b) => { b.onclick = () => {
    const ok = Number(b.dataset.i) === item.answer;
    if (ok) quizState.score += 1;
    why.textContent = (ok ? "Correct. " : "Not quite. ") + item.why;
    why.className = "quiz-why " + (ok ? "ok" : "bad");
    if (score) score.textContent = "Score " + quizState.score;
    setTimeout(() => { quizState.i += 1; renderQuiz(); }, 1400);
  }; });
}

/* ---------- chat ---------- */
function addMessage(text, who, isHTML = false) {
  const w = $("#chatWindow");
  if (!w) return;
  const m = document.createElement("div");
  m.className = "msg " + who;
  m.innerHTML = '<span class="msg-av">' + (who === "bot" ? "♻️" : "🧑") + '</span><div class="msg-bubble">' + (isHTML ? text : escapeHTML(text)) + "</div>";
  w.appendChild(m);
  w.scrollTop = w.scrollHeight;
}
function showTyping() {
  const w = $("#chatWindow");
  const m = document.createElement("div");
  m.className = "msg bot";
  m.innerHTML = '<span class="msg-av">♻️</span><div class="msg-bubble"><span class="typing"><span></span><span></span><span></span></span></div>';
  w.appendChild(m); w.scrollTop = w.scrollHeight;
  return m;
}
function demoAnswer(q) {
  const t = q.toLowerCase();
  if (t.includes("pizza")) { const d = WASTE_DB.pizza_box; return "A <b>pizza box</b> is <span class=\"pill\">CONDITIONAL</span>. " + escapeHTML(d.tip) + " <b>Tear clean lid</b> to Blue, <b>greasy base</b> to Green."; }
  if (t.includes("battery") || t.includes("batteries")) { const d = WASTE_DB.battery; return "<b>Batteries are never general waste</b>. " + escapeHTML(d.tip) + " " + escapeHTML(d.prep.join("; ")) + "."; }
  if (t.includes("flower") || t.includes("puja") || t.includes("temple") || t.includes("mala")) { const d = WASTE_DB.temple_flowers; return "<b>Temple flowers</b> are <span class=\"pill\">COMPOSTABLE</span>. " + escapeHTML(d.tip) + " Remove plastic threads first."; }
  if (t.includes("medicine") || t.includes("medication") || t.includes("drug") || t.includes("expired") || t.includes("tablet")) { const d = WASTE_DB.medicine; return "<b>Old medicines</b> need take-back. " + escapeHTML(d.tip) + " Never bin or flush."; }
  if (t.includes("bulb") || t.includes("cfl") || t.includes("tube") || t.includes("light")) { const d = WASTE_DB.cfl_bulb; return "<b>CFL / tube-lights</b> have mercury. " + escapeHTML(d.prep.join("; ")) + "."; }
  if (t.includes("oil")) { const d = WASTE_DB.cooking_oil; return "<b>Used oil</b>: " + escapeHTML(d.prep.join("; ")) + ". " + escapeHTML(d.tip); }
  if (t.includes("milk") || t.includes("pouch")) { const d = WASTE_DB.milk_pouch; return "<b>Milk pouches</b>: " + escapeHTML(d.prep.join("; ")) + ". " + escapeHTML(d.tip); }
  if (t.includes("compost") || t.includes("kitchen") || t.includes("food")) return "Compost <b>veg peels, coffee grounds, tea, eggshells, leaves, flowers</b>. Avoid meat, dairy, oily food at home. Food in landfill makes methane (~28× CO₂).";
  if (t.includes("plastic bag") || t.includes("polythene") || t.includes("wrapper") || t.includes("film")) { const d = WASTE_DB.plastic_bag; return "<b>Soft plastics</b> are conditional. " + escapeHTML(d.tip) + " Bundle clean and use store drop-off."; }
  if (t.includes("glass")) { const d = WASTE_DB.glass_bottle; return "<b>Glass</b> is infinitely recyclable. " + escapeHTML(d.prep.join("; ")) + "."; }
  if (t.includes("sanitary") || t.includes("diaper") || t.includes("pad")) { const d = WASTE_DB.sanitary_waste; return "<b>Sanitary waste</b>: " + escapeHTML(d.prep.join("; ")) + ". Never with recyclables."; }
  if (t.includes("paint") || t.includes("chemical")) { const d = WASTE_DB.paint_can; return "<b>Paint</b>: never down the drain. " + escapeHTML(d.prep.join("; ")) + "."; }
  if (t.includes("e-waste") || t.includes("ewaste") || t.includes("phone") || t.includes("laptop") || t.includes("electronic") || t.includes("charger")) { const d = WASTE_DB.ewaste; return "<b>E-waste</b> needs special disposal. " + escapeHTML(d.tip) + " Wipe data first."; }
  if (t.includes("reduce") || t.includes("less waste") || t.includes("zero waste") || t.includes("tips")) return "Hierarchy: <b>Refuse, Reduce, Reuse, Recycle</b>. Carry bottle and bag, compost food, buy loose, repair first.";
  if (t.includes("coconut")) { const d = WASTE_DB.coconut_shell; return "<b>Coconut</b>: " + escapeHTML(d.tip) + " " + escapeHTML(d.prep.join("; ")) + "."; }
  if (t.includes("shoe") || t.includes("chappal") || t.includes("cloth") || t.includes("textile")) { const d = WASTE_DB.textile; return "<b>Textiles</b>: wearable to donate, worn to textile bank. " + escapeHTML(d.tip); }
  const id = matchKeyword(t);
  if (id) { const d = WASTE_DB[id]; return "<b>" + escapeHTML(d.name) + "</b> — " + verdictLabel[d.recyclable] + ". Put in <b>" + escapeHTML(d.bin) + "</b>. " + escapeHTML(d.tip); }
  return "I can help with sorting, composting, and waste reduction. Try 'battery', 'tetra pak', 'flowers', or 'how do I reduce waste?'";
}
async function handleChat(q) {
  addMessage(q, "user");
  const typing = showTyping();
  if (!typing) return;
  if (state.live) {
    try {
      const r = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: q }) });
      const j = await r.json();
      typing.remove();
      addMessage(j.reply || "No reply.", "bot", true);
      return;
    } catch {}
  }
  setTimeout(() => { typing.remove(); addMessage(demoAnswer(q), "bot", true); }, 450 + Math.random() * 300);
}

/* ---------- page wiring ---------- */
function initClassify() {
  const order = ["plastic_bottle", "food_waste", "battery", "pizza_box", "milk_pouch", "temple_flowers", "aluminium_can", "ewaste", "cfl_bulb", "textile", "glass_bottle", "cooking_oil"];
  const chips = $("#sampleChips");
  if (chips) {
    chips.innerHTML = "";
    order.forEach((id) => {
      const d = WASTE_DB[id];
      if (!d) return;
      const b = document.createElement("button");
      b.innerHTML = "<span>" + d.emoji + "</span> " + escapeHTML(d.name.split(" (")[0]);
      b.onclick = () => classifyById(id);
      chips.appendChild(b);
    });
  }
  const qGo = $("#qGo");
  if (qGo) qGo.onclick = quickSearch;
  const qInput = $("#qInput");
  if (qInput) qInput.addEventListener("keydown", (e) => { if (e.key === "Enter") quickSearch(); });

  const dz = $("#dropZone"), fi = $("#fileInput"), ci = $("#cameraInput");
  if (dz && fi) {
    const bb = $("#browseBtn"); if (bb) bb.onclick = (e) => { e.stopPropagation(); fi.click(); };
    const cb = $("#cameraBtn"); if (cb) cb.onclick = (e) => { e.stopPropagation(); ci.click(); };
    dz.onclick = () => fi.click();
    fi.onchange = () => fi.files[0] && classifyImage(fi.files[0]);
    if (ci) ci.onchange = () => ci.files[0] && classifyImage(ci.files[0]);
    ["dragover", "dragenter"].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add("drag"); }));
    ["dragleave", "drop"].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove("drag"); }));
    dz.addEventListener("drop", (e) => { const f = e.dataTransfer.files[0]; if (f) classifyImage(f); });
  }
  const sp = $("#speakBtn");
  if (sp) sp.onclick = () => {
    if (!currentResult || !("speechSynthesis" in window)) { toast("Voice not supported here."); return; }
    speechSynthesis.cancel();
    speechSynthesis.speak(new SpeechSynthesisUtterance(currentResult.name + ". Put it in " + currentResult.bin + ". " + currentResult.tip));
  };
  const cp = $("#copyBtn");
  if (cp) cp.onclick = async () => {
    if (!currentResult) return;
    const txt = currentResult.name + " — " + verdictLabel[currentResult.recyclable] + ". Bin: " + currentResult.bin + ". Prep: " + currentResult.prep.join("; ") + ". Tip: " + currentResult.tip;
    try { await navigator.clipboard.writeText(txt); toast("Result copied."); } catch { toast("Copy blocked by browser."); }
  };
  const wr = $("#wrongBtn");
  if (wr) wr.onclick = () => toast("Thanks — flagged for review. Check locally for edge cases.");

  /* Deep-link from Library/Home cards */
  try {
    const pending = sessionStorage.getItem(OPEN_KEY);
    if (pending && WASTE_DB[pending]) { sessionStorage.removeItem(OPEN_KEY); classifyById(pending); }
  } catch {}
}

function initLibrary() {
  const si = $("#searchInput");
  if (!si) return;
  si.addEventListener("input", renderLibrary);
  const fv = $("#filterVerdict");
  if (fv) fv.addEventListener("change", renderLibrary);
  renderLibrary();
}

function initChat() {
  const form = $("#chatForm");
  if (!form) return;
  form.onsubmit = (e) => {
    e.preventDefault();
    const v = $("#chatText").value.trim();
    if (!v) return;
    $("#chatText").value = "";
    handleChat(v);
  };
  const sug = $("#chatSuggest");
  if (sug) sug.querySelectorAll("button").forEach((b) => { b.onclick = () => handleChat(b.textContent); });
}

function initQuiz() {
  const st = $("#quizStart");
  if (!st) return;
  renderQuiz();
  st.onclick = () => {
    if (!quizState.started) { quizState.started = true; quizState.i = 0; quizState.score = 0; st.textContent = "Restart"; }
    else { quizState.i = 0; quizState.score = 0; }
    renderQuiz();
  };
}

function initImpact() {
  if (!$("#statItems") || !$("#historyList") || document.body.dataset.page !== "impact") return;
  refreshImpactUI();
  const cp = $("#copyImpact");
  if (cp) cp.onclick = async () => {
    const txt = "EcoSort impact: " + state.items + " sorted, " + state.recycled + " diverted, " + state.co2.toFixed(1) + "kg CO2e avoided.";
    try { await navigator.clipboard.writeText(txt); toast("Summary copied."); } catch { toast("Copy blocked."); }
  };
  const dl = $("#downloadImpact");
  if (dl) dl.onclick = () => {
    const lines = ["EcoSort impact report", "Exported: " + new Date().toLocaleString(), "Items: " + state.items + ", Diverted: " + state.recycled + ", CO2e: " + state.co2.toFixed(1) + "kg", ""].concat(state.history.map((h) => "- " + h.emoji + " " + h.name + " | " + h.bin + " | " + h.when));
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/plain" }));
    a.download = "ecosort-impact.txt";
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const rs = $("#resetImpact");
  if (rs) rs.onclick = () => {
    state.items = 0; state.recycled = 0; state.co2 = 0; state.history = [];
    saveState(); refreshImpactUI(); toast("Impact reset.");
  };
  window.addEventListener("storage", (e) => { if (e.key === LS_KEY) { loadState(); refreshImpactUI(); } });
}

function initHome() {
  if (document.body.dataset.page !== "home") return;
  refreshImpactUI();
  document.querySelectorAll("[data-open]").forEach((el) => {
    el.addEventListener("click", () => openItem(el.dataset.open));
  });
}

function init() {
  loadState();
  initClassify();
  initLibrary();
  renderBins();
  initChat();
  initQuiz();
  initImpact();
  initHome();
  detectBackend();
}

document.addEventListener("DOMContentLoaded", init);
