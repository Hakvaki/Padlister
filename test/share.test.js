const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

class FakeClassList {
  constructor() { this.set = new Set(); }
  add(c) { this.set.add(c); }
  remove(c) { this.set.delete(c); }
  toggle(c, force) {
    const want = force === undefined ? !this.set.has(c) : force;
    if (want) this.set.add(c); else this.set.delete(c);
  }
  contains(c) { return this.set.has(c); }
}

class FakeElement {
  constructor(tag) {
    this.tagName = tag;
    this.children = [];
    this.classList = new FakeClassList();
    this.listeners = {};
    this.attributes = {};
    this._textContent = "";
    this._innerHTML = "";
    this.value = "";
  }
  set className(v) { this.classList.set = new Set(v.split(/\s+/).filter(Boolean)); }
  get className() { return [...this.classList.set].join(" "); }
  set textContent(v) { this._textContent = String(v); this.children = []; }
  get textContent() {
    if (this.children.length === 0) return this._textContent;
    return this._textContent + this.children.map((c) => c.textContent).join("");
  }
  set innerHTML(v) { this._innerHTML = String(v); if (v === "") this.children = []; }
  get innerHTML() { return this._innerHTML; }
  appendChild(child) { this.children.push(child); return child; }
  append(...nodes) { this.children.push(...nodes); }
  setAttribute(k, v) { this.attributes[k] = v; }
  addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); }
  dispatch(type, event = {}) { for (const fn of this.listeners[type] || []) fn(event); }
  querySelector(sel) {
    if (sel === "tbody") {
      if (!this._tbody) { this._tbody = new FakeElement("tbody"); this.appendChild(this._tbody); }
      return this._tbody;
    }
    throw new Error("unsupported selector " + sel);
  }
  click() { this.dispatch("click", { preventDefault() {} }); }
}

// Minimal mock of the Firebase Realtime Database REST API:
// PUT/GET/DELETE /tournament.json
let dbValue = null;
const dbServer = http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname !== "/tournament.json") {
    res.writeHead(404).end("{}");
    return;
  }
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    if (req.method === "PUT") dbValue = JSON.parse(body);
    if (req.method === "DELETE") dbValue = null;
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(req.method === "GET" ? JSON.stringify(dbValue) : "{}");
  });
});

const elements = {};
for (const id of [
  "setup-panel", "tournament-panel", "setup-form", "setup-error",
  "players-bar", "standings-table", "matches-list", "tournament-status", "reset-btn",
  "scoreboard-btn", "add-round-btn", "finish-btn", "scoreboard-panel",
  "scoreboard-round", "scoreboard-table", "scoreboard-matches", "scoreboard-status", "back-btn",
  "host-panel", "qr-img", "join-code", "join-url", "host-continue-btn", "invite-btn",
  "gate-panel", "gate-form", "gate-code", "gate-error", "gate-scoreboard-btn",
  "history-btn", "history-panel", "history-ranking", "history-list", "history-back-btn",
]) {
  elements[id] = new FakeElement("div");
}
const formInputs = {};
for (const name of ["player0", "player1", "player2", "player3", "hostCode"]) {
  formInputs[name] = new FakeElement("input");
}
elements["setup-form"].elements = formInputs;
elements["setup-form"].reset = () => { for (const i of Object.values(formInputs)) i.value = ""; };

const storage = new Map();
global.localStorage = {
  getItem: (k) => (storage.has(k) ? storage.get(k) : null),
  setItem: (k, v) => storage.set(k, String(v)),
  removeItem: (k) => storage.delete(k),
};
global.document = {
  getElementById: (id) => elements[id],
  createElement: (tag) => new FakeElement(tag),
};

const logic = require("../logic.js");
Object.assign(global, logic);

const settle = () => new Promise((r) => setTimeout(r, 50));

async function main() {
  await new Promise((resolve) => dbServer.listen(0, "127.0.0.1", resolve));
  const hostHash = require("node:crypto").createHash("sha256").update("SECRET1").digest("hex");
  global.window = {
    PADEL_DB_URL: `http://127.0.0.1:${dbServer.address().port}`,
    PADEL_HOST_CODE_HASH: hostHash,
  };

  const appSource = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
  eval(appSource);
  await settle();

  const submitNames = (names, hostCode = "secret1") => {
    names.forEach((n, i) => { formInputs[`player${i}`].value = n; });
    formInputs["hostCode"].value = hostCode;
    elements["setup-form"].dispatch("submit", { preventDefault() {} });
  };

  submitNames(["Ana", "Ben", "Cleo", "Dan"], "wrong-code");
  await settle();
  assert.ok(!elements["setup-error"].classList.contains("hidden"), "wrong host code rejected");
  assert.equal(dbValue, null, "no tournament started without the host code");
  submitNames(["Ana", "Ben", "Cleo", "Dan"], "");
  await settle();
  assert.equal(dbValue, null, "missing host code rejected too");
  const saveScore = (matchIndex, a, b) => {
    const card = elements["matches-list"].children[matchIndex];
    const row = card.children.find((c) => c.classList.contains("score-row"));
    row.children[0].value = String(a);
    row.children[2].value = String(b);
    row.children[3].click();
  };

  submitNames(["Ana", "Ben", "Cleo", "Dan"]);
  await settle();
  assert.deepEqual(dbValue.players, ["Ana", "Ben", "Cleo", "Dan"], "tournament published to shared db");
  assert.equal(dbValue.matches.length, 3);
  assert.match(dbValue.codeHash, /^[0-9a-f]{64}$/, "only the code hash is shared, not the code");
  elements["host-continue-btn"].click();

  saveScore(0, 4, 2);
  saveScore(2, 6, 1);
  await settle();
  assert.deepEqual(dbValue.matches[0].score, { a: 4, b: 2 }, "score published to shared db");
  assert.deepEqual(dbValue.matches[2].score, { a: 6, b: 1 });
  assert.equal(elements["tournament-status"].textContent, "2 of 3 matches played");

  // Another device writes directly to the shared db; the next sync adopts it.
  const foreign = { players: ["Eve", "Finn", "Gus", "Hana"], matches: generateSchedule(4) };
  foreign.matches[1].score = { a: 3, b: 5 };
  dbValue = foreign;
  await syncShared();
  assert.deepEqual(
    elements["players-bar"].children.map((c) => c.textContent),
    ["Eve", "Finn", "Gus", "Hana"],
    "remote update adopted"
  );
  assert.equal(elements["tournament-status"].textContent, "1 of 3 matches played");

  // A missing score key (RTDB drops nulls) is normalized to null.
  assert.equal(JSON.parse(storage.get("padelAmericano4.v1")).matches[0].score, null);

  elements["reset-btn"].click();
  await settle();
  assert.equal(dbValue, null, "reset clears the shared db");
  assert.ok(!elements["setup-panel"].classList.contains("hidden"), "back to setup after remote reset");

  dbServer.close();
  console.log("All share tests passed.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
