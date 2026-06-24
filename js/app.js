/* ====================================================================
   EcoSort — app logic
   Two modes, one UI:
   • DEMO MODE  (default)  — answers come from WASTE_DB + keyword matching.
                             Runs fully offline, no key, no cost.
   • LIVE MODE  (optional) — if a backend is reachable at /api/*, the same
                             calls are routed to a real Claude vision/chat
                             model. The UI does not change. See server.js.
   ==================================================================== */

const state = { items: 0, recycled: 0, co2: 0, live: false };

/* ---- tiny helpers ---- */
const $ = (sel) => document.querySelector(sel);
const verdictLabel = {
  yes: "RECYCLABLE", compost: "COMPOSTABLE", no: "NOT RECYCLABLE",
  special: "SPECIAL DISPOSAL", conditional: "CHECK LOCALLY", reuse: "REUSE / DONATE",
};
const verdictClass = {
  yes: "v-yes", compost: "v-compost", no: "v-no",
  special: "v-special", conditional: "v-conditional", reuse: "v-reuse",
};

/* ---- detect whether a live AI backend exists ---- */
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
  } catch { /* no backend → stay in demo mode */ }
}

/* ====================== CLASSIFIER ====================== */
function matchKeyword(text) {
  const t = (text || "").toLowerCase();
  for (const row of KEYWORD_INDEX) {
    if (row.keys.some((k) => t.includes(k.trim()))) return row.id;
  }
  return null;
}

function renderResult(data) {
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

  $("#rPrep").innerHTML = (data.prep || []).map((p) => `<li>${p}</li>`).join("");
  $("#rCo2").textContent = data.co2 || "";
  $("#rDecompose").textContent = data.decompose || "";
  $("#rTip").textContent = data.tip || "";
  $("#rSource").textContent = data.__source === "model"
    ? "Source: live Claude vision model · confidence reported by the model."
    : "Source: EcoSort knowledge base (SWM 2016 rules) · demo mode.";

  updateImpact(data);
  $("#resultPanel").scrollIntoView({ behavior: "smooth", block: "center" });
}

function updateImpact(data) {
  state.items += 1;
  const counts = ["yes", "compost", "reuse", "special"].includes(data.recyclable);
  if (counts) state.recycled += 1;
  // very rough, clearly-labelled "estimate" — honesty over false precision
  const co2map = { yes: 0.3, compost: 0.5, reuse: 0.8, special: 0.2, conditional: 0.1, no: 0 };
  state.co2 += co2map[data.recyclable] ?? 0;
  $("#statItems").textContent = state.items;
  $("#statRecycled").textContent = state.recycled;
  $("#statCo2").textContent = state.co2.toFixed(1) + " kg";
}

/* classify by item id (sample chips) */
function classifyById(id) {
  const data = { ...WASTE_DB[id], __source: "kb" };
  renderResult(data);
}

/* classify an uploaded image */
async function classifyImage(file) {
  const reader = new FileReader();
  reader.onload = async (e) => {
    $("#preview").src = e.target.result;
    $("#preview").hidden = false;

    if (state.live) {
      // ---- LIVE MODE: send to backend → Claude vision ----
      try {
        const r = await fetch("/api/classify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image: e.target.result }),
        });
        const j = await r.json();
        renderResult({ ...j, __source: "model" });
        return;
      } catch {
        /* fall through to demo behaviour */
      }
    }

    // ---- DEMO MODE: infer from filename, else best-guess ----
    const guess = matchKeyword(file.name);
    if (guess) {
      classifyById(guess);
    } else {
      // honest fallback: show a generic prompt to pick a sample
      const data = { ...WASTE_DB.plastic_bottle, confidence: 0.55, __source: "kb",
        tip: "Demo mode can't see inside the image. I've shown a likely example — tap a sample item below for an exact match, or connect Live AI for real photo analysis." };
      renderResult(data);
    }
  };
  reader.readAsDataURL(file);
}

/* ====================== CHAT ====================== */
const chatWindow = $("#chatWindow");

function addMessage(text, who, isHTML = false) {
  const m = document.createElement("div");
  m.className = "msg " + who;
  m.innerHTML = `<span class="msg-av">${who === "bot" ? "♻️" : "🧑"}</span><div class="msg-bubble">${isHTML ? text : escapeHTML(text)}</div>`;
  chatWindow.appendChild(m);
  chatWindow.scrollTop = chatWindow.scrollHeight;
  return m;
}
function escapeHTML(s) { const d = document.createElement("div"); d.textContent = s; return d.innerHTML; }

function showTyping() {
  const m = document.createElement("div");
  m.className = "msg bot";
  m.innerHTML = `<span class="msg-av">♻️</span><div class="msg-bubble"><span class="typing"><span></span><span></span><span></span></span></div>`;
  chatWindow.appendChild(m);
  chatWindow.scrollTop = chatWindow.scrollHeight;
  return m;
}

/* demo-mode answer engine: knowledge-grounded keyword reasoning */
function demoAnswer(q) {
  const t = q.toLowerCase();

  if (t.includes("pizza")) {
    const d = WASTE_DB.pizza_box;
    return `Great question — it's a classic trap! A <b>pizza box</b> is <span class="pill">CONDITIONAL</span>. ${d.tip} So: <b>tear off the clean cardboard lid</b> → Blue/dry recycling, and put the <b>greasy, cheesy base</b> → Green/compost or general waste. Grease ruins a whole paper-recycling batch, which is why you can't just toss the whole box in.`;
  }
  if (t.includes("battery") || t.includes("batteries")) {
    const d = WASTE_DB.battery;
    return `<b>Batteries are never general waste</b> <span class="pill">HAZARDOUS</span>. ${d.tip} Steps: ${d.prep.map((p) => p.toLowerCase()).join("; ")}. Take them to an e-waste collection point, a battery take-back box at an electronics store, or a municipal hazardous-waste drop-off.`;
  }
  if (t.includes("compost") || t.includes("kitchen") || t.includes("food")) {
    return `You can compost most <b>kitchen organics</b> <span class="pill">COMPOSTABLE</span>: fruit & veg peels, coffee grounds, tea leaves, eggshells, and garden trimmings. <b>Avoid</b> meat, dairy, oily food and pet waste in a home compost (they smell and attract pests). Composting matters because food in landfill releases methane — ~28× more warming than CO₂.`;
  }
  if (t.includes("medicine") || t.includes("medication") || t.includes("drug") || t.includes("expired")) {
    return `<b>Old medicines</b> should <u>never</u> go in the bin or down the toilet <span class="pill">HAZARDOUS</span> — they contaminate water and soil. Use a <b>pharmacy take-back program</b> or a municipal hazardous-waste drop-off. If none exists, your local pharmacist can usually advise on safe disposal.`;
  }
  if (t.includes("plastic bag") || t.includes("polythene") || t.includes("wrapper")) {
    const d = WASTE_DB.plastic_bag;
    return `<b>Soft plastics</b> (bags, wrappers, films) are <span class="pill">CONDITIONAL</span>. ${d.tip} Don't put them in your curbside bin — they tangle the sorting machines. Instead, bundle them clean and dry and use a supermarket soft-plastic drop-off.`;
  }
  if (t.includes("glass")) {
    const d = WASTE_DB.glass_bottle;
    return `<b>Glass</b> is <span class="pill">RECYCLABLE</span> and infinitely so! ${d.prep.join("; ")}. ${d.tip}`;
  }
  if (t.includes("e-waste") || t.includes("ewaste") || t.includes("phone") || t.includes("laptop") || t.includes("electronic") || t.includes("charger")) {
    const d = WASTE_DB.ewaste;
    return `<b>Electronics / e-waste</b> need <span class="pill">SPECIAL DISPOSAL</span>. ${d.tip} Wipe your personal data first, then use a certified e-waste recycler or a manufacturer take-back program.`;
  }
  if (t.includes("reduce") || t.includes("less waste") || t.includes("zero waste") || t.includes("tips")) {
    return `The waste hierarchy is <b>Refuse → Reduce → Reuse → Recycle</b>, in that order. Top wins: carry a reusable bottle & bag, compost food scraps (biggest household impact), buy loose produce, repair before replacing, and say no to single-use plastics. Recycling is the <i>last</i> resort, not the first.`;
  }
  if (t.includes("styrofoam") || t.includes("thermocol")) {
    const d = WASTE_DB.styrofoam;
    return `<b>Styrofoam / thermocol</b> is <span class="pill">NOT RECYCLABLE</span> in most places. ${d.tip} It goes in general waste — but the real fix is refusing it at the source.`;
  }

  // try a direct item match
  const id = matchKeyword(t);
  if (id) {
    const d = WASTE_DB[id];
    return `<b>${d.name}</b> → <span class="pill">${verdictLabel[d.recyclable]}</span>. Put it in <b>${d.bin}</b>. ${d.tip}`;
  }

  return `I can help with how to sort and dispose of almost any household item, what's compostable, local recycling rules, and ways to cut waste. Try naming an item — e.g. "battery", "tetra pak", "old clothes" — or ask "how do I reduce waste?"`;
}

async function handleChat(q) {
  addMessage(q, "user");
  const typing = showTyping();

  if (state.live) {
    try {
      const r = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: q }),
      });
      const j = await r.json();
      typing.remove();
      addMessage(j.reply, "bot", true);
      return;
    } catch { /* fall through */ }
  }

  // demo mode: small delay so the typing animation reads naturally
  setTimeout(() => {
    typing.remove();
    addMessage(demoAnswer(q), "bot", true);
  }, 550 + Math.random() * 350);
}

/* ====================== WIRING ====================== */
function init() {
  // sample chips
  const order = ["plastic_bottle", "food_waste", "battery", "cardboard", "tetrapak",
    "aluminium_can", "pizza_box", "ewaste", "plastic_bag", "glass_bottle", "styrofoam", "textile"];
  const chips = $("#sampleChips");
  order.forEach((id) => {
    const d = WASTE_DB[id];
    const b = document.createElement("button");
    b.innerHTML = `<span>${d.emoji}</span> ${d.name.split(" (")[0]}`;
    b.onclick = () => classifyById(id);
    chips.appendChild(b);
  });

  // upload zone
  const dz = $("#dropZone"), fi = $("#fileInput");
  $("#browseBtn").onclick = (e) => { e.stopPropagation(); fi.click(); };
  dz.onclick = () => fi.click();
  fi.onchange = () => fi.files[0] && classifyImage(fi.files[0]);
  ["dragover", "dragenter"].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add("drag"); }));
  ["dragleave", "drop"].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove("drag"); }));
  dz.addEventListener("drop", (e) => { const f = e.dataTransfer.files[0]; if (f) classifyImage(f); });

  // chat
  $("#chatForm").onsubmit = (e) => {
    e.preventDefault();
    const v = $("#chatText").value.trim();
    if (!v) return;
    $("#chatText").value = "";
    handleChat(v);
  };
  $("#chatSuggest").querySelectorAll("button").forEach((b) => {
    b.onclick = () => handleChat(b.textContent);
  });

  // mode badge explainer
  $("#modeBadge").onclick = () => {
    alert(state.live
      ? "LIVE AI MODE\n\nA backend (server.js) is connected and your requests are answered by a real Claude vision/chat model."
      : "DEMO MODE\n\nEcoSort is running fully offline with no API key and no cost. Answers come from a curated knowledge base built on India's Solid Waste Management Rules 2016.\n\nTo enable real AI vision: set ANTHROPIC_API_KEY and run `node server.js` (see README).");
  };

  detectBackend();
}

document.addEventListener("DOMContentLoaded", init);
