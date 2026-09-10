/* EcoSort v2 — static server + optional Live AI backend (zero deps, Node 18+) */

const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.ANTHROPIC_API_KEY || "";
const MODEL = process.env.ECOSORT_MODEL || "claude-opus-4-8";
const LIVE = Boolean(API_KEY);
const VERSION = "2.0.0";

let ITEM_COUNT = 28;
try {
  const kb = require("./js/knowledge.js");
  ITEM_COUNT = Object.keys(kb.WASTE_DB || {}).length || ITEM_COUNT;
} catch {}

const MIME = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon",
  ".webmanifest": "application/manifest+json", ".txt": "text/plain; charset=utf-8" };

const CLASSIFY_PROMPT = `You are EcoSort, a waste-segregation vision assistant.
Look at the image and identify the single main waste item. Reply with ONLY a JSON
object (no markdown) using exactly these keys:
{ "name": short item name, "emoji": one emoji, "category": material category,
"recyclable": one of "yes"|"compost"|"no"|"special"|"conditional"|"reuse",
"bin": bin/stream (India SWM 2016: Green=wet, Blue=dry, Red/Hazardous, E-waste),
"binColor": hex (#15803d green, #1d4ed8 blue, #b91c1c hazard, #374151 general, #7c3aed conditional, #0891b2 textile),
"confidence": 0-1, "prep": 2-4 steps, "decompose": landfill time, "co2": one sentence, "tip": one practical tip }
If unclear, lower confidence and say so in tip. No medical/hazardous advice beyond standard disposal.`;

const CHAT_PROMPT = `You are EcoSort's recycling assistant. Answer waste sorting, composting, recycling and reduction questions. Be concise (2-4 sentences), practical, Refuse>Reduce>Reuse>Recycle. When local rules vary say "check locally". Simple <b> tags allowed. Stay on sustainability topics; politely redirect anything else.`;

/* ---- tiny in-memory rate limiter for /api/* ---- */
const hits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter(t => now - t < 60_000);
  arr.push(now);
  hits.set(ip, arr);
  return arr.length > 40;
}

async function callClaude(messages, system, maxTokens = 700) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, system, messages }),
  });
  if (!res.ok) throw new Error("Anthropic API " + res.status + ": " + (await res.text()).slice(0, 300));
  const data = await res.json();
  return data.content.map((c) => c.text || "").join("");
}

function readBody(req, limit = 7 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0, chunks = [];
    req.on("data", (c) => { size += c.length; if (size > limit) { reject(new Error("payload too large")); req.destroy(); } else chunks.push(c); });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function secureHeaders(res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
}

const server = http.createServer(async (req, res) => {
  secureHeaders(res);
  const ip = req.socket.remoteAddress || "unknown";
  const urlPath = decodeURIComponent(req.url.split("?")[0]);

  if (urlPath.startsWith("/api/")) {
    res.setHeader("Content-Type", "application/json");
    if (rateLimited(ip)) { res.writeHead(429); return res.end(JSON.stringify({ error: "Rate limited. Try again in a minute." })); }

    if (urlPath === "/api/health") {
      res.writeHead(200);
      return res.end(JSON.stringify({ live: LIVE, model: LIVE ? MODEL : null, version: VERSION, items: ITEM_COUNT }));
    }

    if (urlPath === "/api/classify" && req.method === "POST") {
      if (!LIVE) { res.writeHead(400); return res.end(JSON.stringify({ error: "Demo mode: set ANTHROPIC_API_KEY for live vision." })); }
      try {
        const { image } = JSON.parse(await readBody(req));
        const m = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/s.exec(image || "");
        if (!m) throw new Error("bad image");
        const reply = await callClaude([{ role: "user", content: [
          { type: "image", source: { type: "base64", media_type: m[1], data: m[2] } },
          { type: "text", text: "Classify this waste item." } ] }], CLASSIFY_PROMPT);
        const match = reply.match(/\{[\s\S]*\}/);
        const json = JSON.parse(match ? match[0] : reply);
        res.writeHead(200);
        return res.end(JSON.stringify(json));
      } catch (e) { res.writeHead(500); return res.end(JSON.stringify({ error: String(e.message || e) })); }
    }

    if (urlPath === "/api/chat" && req.method === "POST") {
      if (!LIVE) { res.writeHead(400); return res.end(JSON.stringify({ error: "Demo mode: set ANTHROPIC_API_KEY for live chat." })); }
      try {
        const { message } = JSON.parse(await readBody(req));
        if (!message || String(message).length > 2000) throw new Error("message missing or too long");
        const reply = await callClaude([{ role: "user", content: String(message).slice(0, 2000) }], CHAT_PROMPT, 400);
        res.writeHead(200);
        return res.end(JSON.stringify({ reply }));
      } catch (e) { res.writeHead(500); return res.end(JSON.stringify({ error: String(e.message || e) })); }
    }

    res.writeHead(404);
    return res.end(JSON.stringify({ error: "Not found" }));
  }

  let file = urlPath === "/" ? "/index.html" : urlPath;
  const safe = path.normalize(file).replace(/^(\.\.[\/\\])+/, "").replace(/^\/+/, "");
  const full = path.join(__dirname, safe);
  if (!full.startsWith(__dirname)) { res.writeHead(403); return res.end("Forbidden"); }
  fs.readFile(full, (err, data) => {
    if (err) { res.writeHead(404); return res.end("Not found"); }
    res.writeHead(200, { "Content-Type": MIME[path.extname(full).toLowerCase()] || "application/octet-stream", "Cache-Control": "public, max-age=300" });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`\n  EcoSort v${VERSION} -> http://localhost:${PORT}`);
  console.log(`  Mode: ${LIVE ? "LIVE AI (" + MODEL + ")" : "DEMO (no ANTHROPIC_API_KEY set)"} | items: ${ITEM_COUNT}\n`);
});
