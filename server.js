const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { generateSchedule, isValidScore } = require("./logic.js");

const ROOT = __dirname;
const DATA_FILE = process.env.PADEL_DATA_FILE || path.join(ROOT, "data", "tournament.json");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

function loadState() {
  try {
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.players) || parsed.players.length !== 4) return null;
    if (!Array.isArray(parsed.matches) || parsed.matches.length !== 3) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveState(state) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  const tmp = DATA_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(state));
  fs.renameSync(tmp, DATA_FILE);
}

function clearState() {
  try {
    fs.unlinkSync(DATA_FILE);
  } catch {
    // already gone
  }
}

function validatePlayers(players) {
  if (!Array.isArray(players) || players.length !== 4) {
    return "Exactly four player names are required.";
  }
  if (players.some((p) => typeof p !== "string" || p.trim().length === 0)) {
    return "All four player names are required.";
  }
  const unique = new Set(players.map((p) => p.trim().toLowerCase()));
  if (unique.size !== 4) return "Player names must be unique.";
  return null;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 1e6) {
        req.destroy();
        reject(new Error("Body too large"));
      }
    });
    req.on("end", () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(payload));
}

function serveStatic(res, pathname) {
  const rel = pathname === "/" ? "index.html" : pathname.slice(1);
  const filePath = path.join(ROOT, path.normalize(rel));
  if (!filePath.startsWith(ROOT + path.sep)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }
  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404);
      return res.end("Not found");
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
    res.end(content);
  });
}

function createApp() {
  return async function handler(req, res) {
    const url = new URL(req.url, "http://localhost");
    const pathname = url.pathname;

    if (pathname === "/api/state" && req.method === "GET") {
      return sendJson(res, 200, loadState());
    }

    if (pathname === "/api/tournament" && req.method === "POST") {
      let body;
      try {
        body = await readBody(req);
      } catch {
        return sendJson(res, 400, { error: "Invalid request body." });
      }
      const players = Array.isArray(body.players) ? body.players.map((p) => String(p).trim()) : null;
      const error = validatePlayers(players);
      if (error) return sendJson(res, 400, { error });
      if (loadState()) {
        return sendJson(res, 409, { error: "A tournament is already in progress." });
      }
      const state = { players, matches: generateSchedule(4) };
      saveState(state);
      return sendJson(res, 200, state);
    }

    const matchRoute = pathname.match(/^\/api\/matches\/(\d+)\/score$/);
    if (matchRoute && req.method === "PUT") {
      const state = loadState();
      if (!state) return sendJson(res, 404, { error: "No active tournament." });
      const match = state.matches.find((m) => m.id === Number(matchRoute[1]));
      if (!match) return sendJson(res, 404, { error: "Match not found." });
      let body;
      try {
        body = await readBody(req);
      } catch {
        return sendJson(res, 400, { error: "Invalid request body." });
      }
      const score = { a: Number(body.a), b: Number(body.b) };
      if (!isValidScore(score)) {
        return sendJson(res, 400, { error: "Enter two different non-negative game scores." });
      }
      match.score = score;
      saveState(state);
      return sendJson(res, 200, state);
    }

    if (pathname === "/api/reset" && req.method === "POST") {
      clearState();
      return sendJson(res, 200, null);
    }

    if (pathname.startsWith("/api/")) {
      return sendJson(res, 404, { error: "Not found." });
    }

    if (req.method === "GET") {
      return serveStatic(res, pathname);
    }

    res.writeHead(405);
    res.end("Method not allowed");
  };
}

function startServer({ host = process.env.HOST || "0.0.0.0", port = Number(process.env.PORT) || 8000, quiet = false } = {}) {
  const server = http.createServer(createApp());
  server.listen(port, host, () => {
    if (!quiet) {
      console.log(`Padel Americano running at http://${host}:${port}`);
      console.log("Share your LAN address (e.g. http://192.168.x.x:" + port + ") so others can join the session.");
    }
  });
  return server;
}

if (require.main === module) {
  startServer();
}

module.exports = { createApp, startServer, loadState, saveState, clearState };
