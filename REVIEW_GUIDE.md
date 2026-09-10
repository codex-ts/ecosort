# EcoSort — 5-Minute Review Demo Script

Use this order. Every step works offline in Demo Mode. No API key needed.

## 0-30s — Hook
Open `#classify`. Say: one wrong item contaminates a whole batch. EcoSort answers at the bin moment: which bin, how to prep, why it matters.

## 30s-2min — Classify (wow)
1. Search `pizza` → open Pizza Box card. Point to split rule: clean lid Blue, greasy base Green.
2. Search `battery` → open Battery. Point to confidence, red bin, terminal-taping step.
3. Search `flowers` → Temple Flowers. India-specific story: 8M tonnes yearly, compost not river.
4. Optional: upload any photo named `battery.jpg` to show filename inference. Say Live AI with key does real vision.

## 2-3min — Library + Bins
Scroll `#library`. 28 items, filter by `Special disposal`. Open `#bins`: Green wet, Blue dry, Red hazardous, Black general. Quote SWM 2016.

## 3-4min — Quiz + Chat
`#quiz` Start. Answer Q1 split-box, Q2 batteries. Then `#chat`: ask `Where do temple flowers go?` and `How do I dispose of old medicines?` Both answered from knowledge base.

## 4-5min — Impact + Responsible AI
`#impact`: items sorted, diverted, CO2e, level badge, equivalents, history persisted on device. Copy summary or Download report. Close with footer: confidence plus source on every result, conditional items say check locally, photos stay in browser, estimates labelled.

## If asked
- Live AI? Same UI, Claude vision via `node server.js` with `ANTHROPIC_API_KEY`. Health at `/api/health`.
- Offline? Yes. Open `index.html` directly or service worker caches static assets.
- Data? History in localStorage only. No tracking.
- Scale? Campus pilot, region rules, local languages, municipal app integration.

## Quick checks before review
- `node --check js/app.js && node --check js/knowledge.js && node --check server.js`
- `node server.js` → http://localhost:3000 → `/api/health` shows `live:false, items:28`
- Search `oil`, `coconut`, `bulb` each return a card.
