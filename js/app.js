/* EcoSort v2 — demo + live modes, library, quiz, impact with persistence */

const state = { items: 0, recycled: 0, co2: 0, live: false, history: [] };
let currentResult = null;
const LS_KEY = "ecosort-v2";

const $ = (sel) => document.querySelector(sel);
const verdictLabel = {
  yes: "RECYCLABLE", compost: "COMPOSTABLE", no: "NOT RECYCLABLE",
  special: "SPECIAL DISPOSAL", conditional: "CHECK LOCALLY", reuse: "REUSE / DONATE",
};
const verdictClass = {
  yes: "v-yes", compost: "v-compost", no: "v-no",
  special: "v-special", conditional: "v-conditional", reuse: "v-reuse",
};
const CO2MAP = { yes: 0.3, compost: 0.5, reuse: 0.8, special: 0.2, conditional: 0.1, no: 0 };

function toast(msg) {
  const t = $("#toast");
  if (!t) return;
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove("show"), 2200);
}

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

async function detectBackend() {
  try {
    const r = await fetch("/api/health", { method: "GET" });
    if (r.ok) {
      const j = await r.json();
      if (j.live) {
        state.live = true;
        const b = $("#modeBadge");
        b.textContent = "Live AI";
        b.classList.remove("mode-demo");
        b.classList.add("mode-live");
        $("#uzHint").textContent = "Live AI connected — your photo is analysed by a Claude vision model.";
      }
    }
  } catch {}
}

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
    const hay = (d.name + " " + d.category + " " + d.bin + " " + (KEYWORD_INDEX.find(k => k.id === id)?.keys.join(" ") || "")).toLowerCase();
    return t.split(/\s+/).every(w => hay.includes(w));
  });
}

function levelFor(n) {
  if (n >= 25) return ["🏆 Eco Champion", 25, 50];
  if (n >= 12) return ["🌳 Eco Leader", 12, 25];
  if (n >= 5) return ["🌿 Eco Doer", 5, 12];
  return ["🌱 Eco Beginner", 0, 5];
}

function refreshImpactUI() {
  $("#statItems").textContent = state.items;
  $("#statRecycled").textContent = state.recycled;
  $("#statCo2").textContent = state.co2.toFixed(1) + " kg";
  const [label, lo, hi] = levelFor(state.items);
  $("#levelBadge").textContent = label;
  const pct = Math.min(100, Math.round(((state.items - lo) / Math.max(1, hi - lo)) * 100));
  $("#levelFill").style.width = pct + "%";
  $("#levelNext").textContent = state.items >= 25 ? "max level" : (hi - state.items) + " to next level";
  const trees = (state.co2 / 21).toFixed(1);
  const km = Math.round(state.co2 * 4.5);
  $("#equivLine").textContent = state.items === 0
    ? "Sort your first item to start your streak."
    : `≈ ${trees} tree-years of CO₂ or ~${km} km not driven by car. Estimates, not precision claims.`;
  const h = $("#historyList");
  h.innerHTML = state.history.length === 0
    ? `<li class="hist-empty">No items yet — search or tap a sample above.</li>`
    : state.history.slice().reverse().map(x => `<li><span>${x.emoji}</span><div><b>${escapeHTML(x.name)}</b><small>${escapeHTML(x.bin)} · ${x.when}</small></div></li>`).join("");
}

function updateImpact(data) {
  state.items += 1;
  if (["yes", "compost", "reuse", "special"].includes(data.recyclable)) state.recycled += 1;
  state.co2 += CO2MAP[data.recyclable] ?? 0;
  state.history.push({ emoji: data.emoji, name: data.name, bin: data.bin, when: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) });
  state.history = state.history.slice(-20);
  saveState();
  refreshImpactUI();
}

function renderResult(data) {
  currentResult = data;
  $("#resultPanel").hidden = false;
  $("#rEmoji").textContent = data.emoji || "♻️";
  $("#rName").textContent = data.name;
  $("#rCategory").textContent = data.category;
  const v = $("#rVerdict");
  v.textContent = verdictLabel[data.recyclable] || "REVIEW";
  v.className = "rc-verdict " + (verdictClass[data.recyclable] || "v-conditional");
  $("#rBinDot").style.background = data.binColor || "#888";
  $("#rBinName").textContent = data.bin;
  $("#rConf").textContent = Math.round((data.confidence || 0.9) * 100) + "%";
  $("#rPrep").innerHTML = (data.prep || []).map((p) => `<li>${escapeHTML(p)}</li>`).join("");
  $("#rCo2").textContent = data.co2 || "";
  $("#rDecompose").textContent = data.decompose || "";
  $("#rTip").textContent = data.tip || "";
  $("#rSource").textContent = data.__source === "model"
    ? "Source: live Claude vision model · confidence reported by the model."
    : "Source: EcoSort knowledge base (SWM 2016 rules) · demo mode.";
  updateImpact(data);
  $("#resultPanel").scrollIntoView({ behavior: "smooth", block: "center" });
}

function classifyById(id) {
  const d = WASTE_DB[id];
  if (!d) return;
  renderResult({ ...d, __source: "kb" });
}

async function classifyImage(file) {
  const reader = new FileReader();
  reader.onload = async (e) => {
    $("#preview").src = e.target.result;
    $("#preview").hidden = false;
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
    const guess = matchKeyword(file.name.replace(/[._-]+/g, " "));
    if (guess) { classifyById(guess); }
    else {
      renderResult({ ...WASTE_DB.plastic_bottle, confidence: 0.55, __source: "kb",
        tip: "Demo mode can't see inside the image — it matched by filename. Tap a sample or search for an exact match, or connect Live AI for real photo analysis." });
    }
  };
  reader.readAsDataURL(file);
}

/* ---------- library / bins ---------- */
function renderLibrary() {
  const q = $("#searchInput").value;
  const f = $("#filterVerdict").value;
  const list = searchItems(q, f);
  $("#libCount").textContent = list.length + " items";
  $("#libraryGrid").innerHTML = list.map(([id, d]) =>
    `<button class="lib-card" data-id="${id}"><span class="lib-emoji">${d.emoji}</span><div><b>${escapeHTML(d.name)}</b><small>${escapeHTML(d.bin)}</small></div><span class="lib-pill ${verdictClass[d.recyclable]}">${verdictLabel[d.recyclable]}</span></button>`
  ).join("") || `<p class="lib-empty">No matches. Try 'bottle', 'oil', 'flowers'.</p>`;
  $("#libraryGrid").querySelectorAll("button").forEach(b => b.onclick = () => classifyById(b.dataset.id));
}

function renderBins() {
  $("#binGrid").innerHTML = BIN_GUIDE.map(b =>
    `<div class="bin-card"><span class="bin-dot" style="background:${b.color}"></span><div><b>${escapeHTML(b.name)}</b><p>${escapeHTML(b.items)}</p><small>${escapeHTML(b.tip)}</small></div></div>`
  ).join("");
}

/* ---------- quiz ---------- */
const quizState = { i: 0, score: 0, started: false };
function renderQuiz() {
  const Q = $("#quizQ"), opts = $("#quizOpts"), why = $("#quizWhy"), score = $("#quizScore");
  if (!quizState.started) { Q.textContent = "Press Start to begin."; opts.innerHTML = ""; why.textContent = ""; score.textContent = ""; return; }
  if (quizState.i >= QUIZ.length) {
    Q.textContent = `Done! You scored ${quizState.score}/${QUIZ.length}.`;
    opts.innerHTML = "";
    why.textContent = quizState.score === QUIZ.length ? "Flawless — ready for review questions." : "Replay to lock the tricky ones: pizza box, CFL, milk pouch.";
    score.textContent = "";
    $("#quizStart").textContent = "Replay quiz";
    quizState.started = false; quizState.i = 0;
    return;
  }
  const item = QUIZ[quizState.i];
  Q.textContent = `Q${quizState.i + 1}/${QUIZ.length} · ${item.q}`;
  why.textContent = "";
  score.textContent = `Score ${quizState.score}`;
  opts.innerHTML = item.options.map((o, idx) => `<button data-i="${idx}">${escapeHTML(o)}</button>`).join("");
  opts.querySelectorAll("button").forEach(b => b.onclick = () => {
    const pick = Number(b.dataset.i);
    const ok = pick === item.answer;
    if (ok) quizState.score += 1;
    why.textContent = (ok ? "Correct. " : "Not quite. ") + item.why;
    why.className = "quiz-why " + (ok ? "ok" : "bad");
    score.textContent = `Score ${quizState.score}`;
    setTimeout(() => { quizState.i += 1; renderQuiz(); }, 1400);
  });
}

/* ---------- chat ---------- */
function addMessage(text, who, isHTML = false) {
  const w = $("#chatWindow");
  const m = document.createElement("div");
  m.className = "msg " + who;
  m.innerHTML = `<span class="msg-av">${who === "bot" ? "♻️" : "🧑"}</span><div class="msg-bubble">${isHTML ? text : escapeHTML(text)}</div>`;
  w.appendChild(m);
  w.scrollTop = w.scrollHeight;
}
function escapeHTML(s) { const d = document.createElement("div"); d.textContent = String(s); return d.innerHTML; }
function showTyping() {
  const w = $("#chatWindow");
  const m = document.createElement("div");
  m.className = "msg bot";
  m.innerHTML = `<span class="msg-av">♻️</span><div class="msg-bubble"><span class="typing"><span></span><span></span><span></span></span></div>`;
  w.appendChild(m); w.scrollTop = w.scrollHeight;
  return m;
}

function demoAnswer(q) {
  const t = q.toLowerCase();
  if (t.includes("pizza")) { const d = WASTE_DB.pizza_box; return `A <b>pizza box</b> is <span class="pill">CONDITIONAL</span>. ${escapeHTML(d.tip)} <b>Tear clean lid</b> to Blue, <b>greasy base</b> to Green.`; }
  if (t.includes("battery") || t.includes("batteries")) { const d = WASTE_DB.battery; return `<b>Batteries are never general waste</b>. ${escapeHTML(d.tip)} ${escapeHTML(d.prep.join("; "))}.`; }
  if (t.includes("flower") || t.includes("puja") || t.includes("temple") || t.includes("mala")) { const d = WASTE_DB.temple_flowers; return `<b>Temple flowers</b> are <span class="pill">COMPOSTABLE</span>. ${escapeHTML(d.tip)} Remove plastic threads first.`; }
  if (t.includes("medicine") || t.includes("medication") || t.includes("drug") || t.includes("expired") || t.includes("tablet")) { const d = WASTE_DB.medicine; return `<b>Old medicines</b> need take-back. ${escapeHTML(d.tip)} Never bin or flush.`; }
  if (t.includes("bulb") || t.includes("cfl") || t.includes("tube") || t.includes("light")) { const d = WASTE_DB.cfl_bulb; return `<b>CFL / tube-lights</b> have mercury. ${escapeHTML(d.prep.join("; "))}.`; }
  if (t.includes("oil")) { const d = WASTE_DB.cooking_oil; return `<b>Used oil</b>: ${escapeHTML(d.prep.join("; "))}. ${escapeHTML(d.tip)}`; }
  if (t.includes("milk") || t.includes("pouch")) { const d = WASTE_DB.milk_pouch; return `<b>Milk pouches</b>: ${escapeHTML(d.prep.join("; "))}. ${escapeHTML(d.tip)}`; }
  if (t.includes("compost") || t.includes("kitchen") || t.includes("food")) return `Compost <b>veg peels, coffee grounds, tea, eggshells, leaves, flowers</b>. Avoid meat, dairy, oily food at home. Food in landfill makes methane (~28× CO₂).`;
  if (t.includes("plastic bag") || t.includes("polythene") || t.includes("wrapper") || t.includes("film")) { const d = WASTE_DB.plastic_bag; return `<b>Soft plastics</b> are conditional. ${escapeHTML(d.tip)} Bundle clean and use store drop-off.`; }
  if (t.includes("glass")) { const d = WASTE_DB.glass_bottle; return `<b>Glass</b> is infinitely recyclable. ${escapeHTML(d.prep.join("; "))}.`; }
  if (t.includes("sanitary") || t.includes("diaper") || t.includes("pad")) { const d = WASTE_DB.sanitary_waste; return `<b>Sanitary waste</b>: ${escapeHTML(d.prep.join("; "))}. Never with recyclables.`; }
  if (t.includes("paint") || t.includes("chemical")) { const d = WASTE_DB.paint_can; return `<b>Paint</b>: never down the drain. ${escapeHTML(d.prep.join("; "))}.`; }
  if (t.includes("e-waste") || t.includes("ewaste") || t.includes("phone") || t.includes("laptop") || t.includes("electronic") || t.includes("charger")) { const d = WASTE_DB.ewaste; return `<b>E-waste</b> needs special disposal. ${escapeHTML(d.tip)} Wipe data first.`; }
  if (t.includes("reduce") || t.includes("less waste") || t.includes("zero waste") || t.includes("tips")) return `Hierarchy: <b>Refuse, Reduce, Reuse, Recycle</b>. Carry bottle and bag, compost food, buy loose, repair first.`;
  if (t.includes("coconut")) { const d = WASTE_DB.coconut_shell; return `<b>Coconut</b>: ${escapeHTML(d.tip)} ${escapeHTML(d.prep.join("; "))}.`; }
  if (t.includes("shoe") || t.includes("chappal") || t.includes("cloth") || t.includes("textile")) { const d = WASTE_DB.textile; return `<b>Textiles</b>: wearable to donate, worn to textile bank. ${escapeHTML(d.tip)}`; }
  const id = matchKeyword(t);
  if (id) { const d = WASTE_DB[id]; return `<b>${escapeHTML(d.name)}</b> — ${verdictLabel[d.recyclable]}. Put in <b>${escapeHTML(d.bin)}</b>. ${escapeHTML(d.tip)}`; }
  return `I can help with sorting, composting, and waste reduction. Try 'battery', 'tetra pak', 'flowers', or 'how do I reduce waste?'`;
}

async function handleChat(q) {
  addMessage(q, "user");
  const typing = showTyping();
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

/* ---------- wiring ---------- */
function init() {
  loadState();
  const theme = localStorage.getItem("ecosort-theme") || "light";
  document.documentElement.dataset.theme = theme;
  $("#themeBtn").textContent = theme === "dark" ? "☀️" : "🌙";

  const order = ["plastic_bottle", "food_waste", "battery", "pizza_box", "milk_pouch", "temple_flowers", "aluminium_can", "ewaste", "cfl_bulb", "textile", "glass_bottle", "cooking_oil"];
  const chips = $("#sampleChips");
  chips.innerHTML = "";
  order.forEach((id) => {
    const d = WASTE_DB[id];
    if (!d) return;
    const b = document.createElement("button");
    b.innerHTML = `<span>${d.emoji}</span> ${escapeHTML(d.name.split(" (")[0])}`;
    b.onclick = () => classifyById(id);
    chips.appendChild(b);
  });

  $("#searchInput").addEventListener("input", renderLibrary);
  $("#filterVerdict").addEventListener("change", renderLibrary);
  renderLibrary();
  renderBins();
  renderQuiz();
  refreshImpactUI();

  const dz = $("#dropZone"), fi = $("#fileInput"), ci = $("#cameraInput");
  $("#browseBtn").onclick = (e) => { e.stopPropagation(); fi.click(); };
  $("#cameraBtn").onclick = (e) => { e.stopPropagation(); ci.click(); };
  dz.onclick = () => fi.click();
  fi.onchange = () => fi.files[0] && classifyImage(fi.files[0]);
  ci.onchange = () => ci.files[0] && classifyImage(ci.files[0]);
  ["dragover", "dragenter"].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add("drag"); }));
  ["dragleave", "drop"].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove("drag"); }));
  dz.addEventListener("drop", (e) => { const f = e.dataTransfer.files[0]; if (f) classifyImage(f); });

  $("#chatForm").onsubmit = (e) => {
    e.preventDefault();
    const v = $("#chatText").value.trim();
    if (!v) return;
    $("#chatText").value = "";
    handleChat(v);
  };
  $("#chatSuggest").querySelectorAll("button").forEach((b) => { b.onclick = () => handleChat(b.textContent); });

  $("#modeBadge").onclick = () => {
    alert(state.live
      ? "LIVE AI MODE\n\nBackend connected. Requests use a real Claude vision/chat model."
      : "DEMO MODE\n\nFully offline, no key, no cost. Answers from curated SWM 2016 knowledge base.\n\nFor real AI vision: set ANTHROPIC_API_KEY and run node server.js.");
  };

  $("#themeBtn").onclick = () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    localStorage.setItem("ecosort-theme", next);
    $("#themeBtn").textContent = next === "dark" ? "☀️" : "🌙";
  };

  $("#speakBtn").onclick = () => {
    if (!currentResult || !("speechSynthesis" in window)) { toast("Voice not supported here."); return; }
    speechSynthesis.cancel();
    speechSynthesis.speak(new SpeechSynthesisUtterance(`${currentResult.name}. Put it in ${currentResult.bin}. ${currentResult.tip}`));
  };
  $("#copyBtn").onclick = async () => {
    if (!currentResult) return;
    const txt = `${currentResult.name} — ${verdictLabel[currentResult.recyclable]}. Bin: ${currentResult.bin}. Prep: ${currentResult.prep.join("; ")}. Tip: ${currentResult.tip}`;
    try { await navigator.clipboard.writeText(txt); toast("Result copied."); }
    catch { toast("Copy blocked by browser."); }
  };
  $("#wrongBtn").onclick = () => toast("Thanks — flagged for review. Check locally for edge cases.");

  $("#quizStart").onclick = () => {
    if (!quizState.started) { quizState.started = true; quizState.i = 0; quizState.score = 0; $("#quizStart").textContent = "Restart"; }
    else { quizState.i = 0; quizState.score = 0; }
    renderQuiz();
  };

  $("#copyImpact").onclick = async () => {
    const txt = `EcoSort impact: ${state.items} sorted, ${state.recycled} diverted, ${state.co2.toFixed(1)}kg CO2e avoided.`;
    try { await navigator.clipboard.writeText(txt); toast("Summary copied."); } catch { toast("Copy blocked."); }
  };
  $("#downloadImpact").onclick = () => {
    const lines = ["EcoSort impact report", `Exported: ${new Date().toLocaleString()}`, `Items: ${state.items}, Diverted: ${state.recycled}, CO2e: ${state.co2.toFixed(1)}kg`, "", ...state.history.map(h => `- ${h.emoji} ${h.name} | ${h.bin} | ${h.when}`)];
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/plain" }));
    a.download = "ecosort-impact.txt";
    a.click();
    URL.revokeObjectURL(a.href);
  };
  $("#resetImpact").onclick = () => {
    state.items = 0; state.recycled = 0; state.co2 = 0; state.history = [];
    saveState(); refreshImpactUI(); toast("Impact reset.");
  };

  if ("serviceWorker" in navigator) { navigator.serviceWorker.register("sw.js").catch(() => {}); }

  detectBackend();
}

document.addEventListener("DOMContentLoaded", init);
