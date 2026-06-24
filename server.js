/* ====================================================================
   EcoSort — optional local server for LIVE AI MODE
   --------------------------------------------------------------------
   Run this ONLY when you want real AI (e.g. for testing/demo). It:
     1. serves the static site (index.html, css, js)
     2. exposes /api/classify  → Claude vision analyses an uploaded photo
        and /api/chat          → Claude answers recycling questions
   Without it, opening index.html directly still works in DEMO MODE.

   Zero dependencies — pure Node 18+ (uses the built-in fetch + http).

   Usage (PowerShell):
     $env:ANTHROPIC_API_KEY = "sk-ant-..."
     node server.js
     # open http://localhost:3000

   The model is read from $env:ECOSORT_MODEL (default: claude-opus-4-8).
   ==================================================================== */

const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.ANTHROPIC_API_KEY || "";
const MODEL = process.env.ECOSORT_MODEL || "claude-opus-4-8";
const LIVE = Boolean(API_KEY);

const MIME = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript",
  ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon" };

/* The system prompt is the heart of the "AI element": it forces the model to
   return the SAME structured shape the demo knowledge base uses, so the front
   end is identical in both modes — and it bakes in Responsible-AI behaviour
   (confidence, honesty about uncertainty, no medical/legal overreach). */
const CLASSIFY_PROMPT = `You are EcoSort, a waste-segregation vision assistant.
Look at the image and identify the single main waste item. Reply with ONLY a JSON
object (no markdown) using exactly these keys:
{
  "name": short item name,
  "emoji": one relevant emoji,
  "category": material category,
  "recyclable": one of "yes" | "compost" | "no" | "special" | "conditional" | "reuse",
  "bin": which bin/stream (use India SWM 2016 colours: Green=wet, Blue=dry, Red/Hazardous, E-waste),
  "binColor": a hex colour for that bin (#15803d green, #1d4ed8 blue, #b91c1c hazard, #374151 general, #7c3aed conditional, #0891b2 textile),
  "confidence": your honest confidence 0-1,
  "prep": array of 2-4 short preparation steps,
  "decompose": rough landfill decomposition time,
  "co2": one sentence on the environmental impact,
  "tip": one practical, non-obvious tip
}
If the image is unclear, lower the confidence and say so in the tip. Never guess medical or hazardous-handling advice beyond standard disposal.`;

const CHAT_PROMPT = `You are EcoSort's recycling assistant. Answer questions about
waste sorting, composting, recycling rules and waste reduction. Be concise (2-4
sentences), practical, and follow the Refuse>Reduce>Reuse>Recycle hierarchy. When
local rules vary, say "check locally". You may use simple <b> tags for emphasis.
Stay strictly on sustainability/waste topics; politely redirect anything else.`;

async function callClaude(messages, system, maxTokens = 700) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, system, messages }),
  });
  if (!res.ok) throw new Error("Anthropic API " + res.status + ": " + (await res.text()));
  const data = await res.json();
  return data.content.map((c) => c.text || "").join("");
}

function readBody(req) {
  return new Promise((resolve) => {
    let b = "";
    req.on("data", (c) => (b += c));
    req.on("end", () => resolve(b));
  });
}

const server = http.createServer(async (req, res) => {
  // ---- API: health ----
  if (req.url === "/api/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ live: LIVE, model: LIVE ? MODEL : null }));
  }

  // ---- API: classify (vision) ----
  if (req.url === "/api/classify" && req.method === "POST") {
    try {
      const { image } = JSON.parse(await readBody(req));
      const m = /^data:(image\/[a-z]+);base64,(.+)$/s.exec(image || "");
      if (!m) throw new Error("bad image");
      const reply = await callClaude([{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: m[1], data: m[2] } },
          { type: "text", text: "Classify this waste item." },
        ],
      }], CLASSIFY_PROMPT);
      // Robustly extract the JSON object even if the model adds prose/fences.
      const match = reply.match(/\{[\s\S]*\}/);
      const json = JSON.parse(match ? match[0] : reply);
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify(json));
    } catch (e) {
      res.writeHead(500, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: String(e) }));
    }
  }

  // ---- API: chat ----
  if (req.url === "/api/chat" && req.method === "POST") {
    try {
      const { message } = JSON.parse(await readBody(req));
      const reply = await callClaude([{ role: "user", content: message }], CHAT_PROMPT, 400);
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ reply }));
    } catch (e) {
      res.writeHead(500, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: String(e) }));
    }
  }

  // ---- static files ----
  let file = decodeURIComponent(req.url.split("?")[0]);
  if (file === "/") file = "/index.html";
  const full = path.join(__dirname, path.normalize(file).replace(/^(\.\.[/\\])+/, ""));
  fs.readFile(full, (err, data) => {
    if (err) { res.writeHead(404); return res.end("Not found"); }
    res.writeHead(200, { "Content-Type": MIME[path.extname(full)] || "application/octet-stream" });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`\n  ♻️  EcoSort running → http://localhost:${PORT}`);
  console.log(`     Mode: ${LIVE ? "LIVE AI (" + MODEL + ")" : "DEMO (no ANTHROPIC_API_KEY set)"}\n`);
});
