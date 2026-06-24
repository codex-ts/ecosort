# ♻️ EcoSort — AI Waste Segregation Assistant

> **1M1B AI for Sustainability Virtual Internship** · in collaboration with **IBM SkillsBuild & AICTE**
> **Sirlapu Tanish**, GITAM University, Vizag
> **Primary SDG 12** · Responsible Consumption & Production (secondary: SDG 11 & 13)
>
> 🔗 **Live demo:** https://codex-ts.github.io/ecosort/ &nbsp;·&nbsp; **Repo:** https://github.com/codex-ts/ecosort

Most people *want* to recycle correctly — but guess wrong. One contaminated item
(a greasy box, a battery, a soft-plastic bag) can spoil an entire batch and send it
to landfill. **EcoSort** uses AI to tell anyone, instantly, **which bin an item belongs
in, how to prepare it, and the impact of getting it right.**

![EcoSort landing](docs/01-hero.png)

---

## ✨ What it does

| Feature | Description | AI element |
|---|---|---|
| 📷 **Photo classify** | Snap/upload a waste item → get its category, correct bin, prep steps, decomposition time & impact | Multimodal **vision classification** |
| 🧠 **Knowledge result card** | Transparent output with **confidence score** and **source** label | Structured, explainable output |
| 💬 **Recycling assistant** | Conversational AI for tricky cases ("greasy pizza box?", "old medicines?") | **Conversational AI** grounded in a waste KB |
| 🌍 **Impact tracker** | Honest, clearly-estimated CO₂ avoided per session | Behavioural nudge |

13 waste types, bin logic based on **India's Solid Waste Management Rules 2016**
(Green = wet · Blue = dry/recyclable · Red/Hazardous · dedicated E-waste).

---

## 🧩 Two modes, one interface

EcoSort is built so the **AI is only needed when you want it** (e.g. for testing/demo) —
the app is fully usable, free, and private without any key.

| Mode | How it runs | What powers the answers |
|---|---|---|
| **🟡 Demo Mode** (default) | Just open `index.html` — no key, no cost, fully offline | A curated knowledge base + keyword reasoning that mirrors the model's output shape |
| **🟢 Live AI Mode** (optional) | `node server.js` with an API key set | A real **Claude vision + chat model** classifies your actual photo and answers freely |

The UI is **identical** in both modes — the live model is prompted to return the exact
same structured fields the demo uses (see `server.js`).

---

## 🚀 Run it

### Demo mode (zero setup)
```bash
# Option A — just open the file
start index.html          # Windows

# Option B — serve it (recommended)
node server.js            # → http://localhost:3000
```

### Live AI mode (real vision, for testing)
```powershell
$env:ANTHROPIC_API_KEY = "sk-ant-..."      # your key
$env:ECOSORT_MODEL = "claude-opus-4-8"     # optional, this is the default
node server.js                              # badge flips to “Live AI”
```
Now uploading a photo sends it to the model, which returns a real classification.

> No build step, no dependencies — `server.js` is pure Node 18+ (built-in `http` + `fetch`).

---

## 🤖 AI elements & tools used

- **Multimodal vision classification** — Claude vision model identifies the item from a photo.
- **Conversational AI** — chat assistant for free-form recycling questions.
- **Prompt engineering** — a structured system prompt forces consistent, explainable JSON
  output and bakes in Responsible-AI behaviour (`server.js` → `CLASSIFY_PROMPT` / `CHAT_PROMPT`).
- **Knowledge-grounded fallback** — an offline KB (`js/knowledge.js`) built on SWM 2016 so the
  tool is accurate and usable without any model call.
- **Stack:** vanilla HTML/CSS/JS front end · zero-dependency Node backend · Anthropic Messages API.

---

## 🛡️ Responsible AI

- **Transparency** — every result shows a **confidence %** and whether it came from the
  knowledge base or the live model.
- **Fairness** — rules follow **public** SWM 2016 standards, not assumptions about users.
- **Honesty** — "conditional" items (cartons, soft plastic, pizza boxes) are flagged
  with *"check locally"* rather than over-claiming.
- **Privacy** — in demo mode photos are read **in-browser** and never uploaded or stored.
- **Scope safety** — the assistant redirects off-topic questions and avoids medical/legal overreach.

---

## 📸 Screenshots

| | |
|---|---|
| ![Result](docs/02-result-battery.png) | ![Pizza](docs/03-result-pizza.png) |
| ![Chat](docs/04-chat.png) | ![Mobile](docs/07-mobile.png) |

See [`SUBMISSION.md`](SUBMISSION.md) for the full project write-up (problem statement,
design-thinking process, impact statement).

---

## 📁 Structure
```
index.html         landing + classifier + chat + impact UI
css/styles.css     eco-themed styling
js/knowledge.js    waste knowledge base (powers demo mode)
js/app.js          classifier, chat engine, mode detection
server.js          optional Node backend for real Claude AI
docs/              screenshots
SUBMISSION.md      formal internship deliverable
```

---

*Educational prototype. Disposal rules vary by municipality — always check local guidelines.*
Built with responsible AI for the planet. ♻️
