const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

class FakeClassList {
  constructor() {
    this.set = new Set();
  }
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
  set className(v) {
    this.classList.set = new Set(v.split(/\s+/).filter(Boolean));
  }
  get className() {
    return [...this.classList.set].join(" ");
  }
  set textContent(v) {
    this._textContent = String(v);
    this.children = [];
  }
  get textContent() {
    if (this.children.length === 0) return this._textContent;
    return this._textContent + this.children.map((c) => c.textContent).join("");
  }
  set innerHTML(v) {
    this._innerHTML = String(v);
    if (v === "") this.children = [];
  }
  get innerHTML() { return this._innerHTML; }
  appendChild(child) { this.children.push(child); return child; }
  append(...nodes) { this.children.push(...nodes); }
  setAttribute(k, v) { this.attributes[k] = v; }
  addEventListener(type, fn) {
    (this.listeners[type] = this.listeners[type] || []).push(fn);
  }
  dispatch(type, event = {}) {
    for (const fn of this.listeners[type] || []) fn(event);
  }
  querySelector(sel) {
    if (sel === "tbody") {
      if (!this._tbody) {
        this._tbody = new FakeElement("tbody");
        this.appendChild(this._tbody);
      }
      return this._tbody;
    }
    throw new Error("unsupported selector " + sel);
  }
  click() { this.dispatch("click", { preventDefault() {} }); }
}

const elements = {};
for (const id of [
  "setup-panel", "tournament-panel", "setup-form", "setup-error",
  "players-bar", "standings-table", "matches-list", "tournament-status", "reset-btn",
  "scoreboard-btn", "add-round-btn", "finish-btn", "scoreboard-panel",
  "scoreboard-round", "scoreboard-table", "scoreboard-matches", "scoreboard-status", "back-btn",
  "host-panel", "qr-img", "join-code", "join-url", "host-continue-btn", "invite-btn",
  "gate-panel", "gate-form", "gate-code", "gate-error", "gate-scoreboard-btn",
]) {
  elements[id] = new FakeElement("div");
}

const formInputs = {};
for (const name of ["player0", "player1", "player2", "player3"]) {
  formInputs[name] = new FakeElement("input");
}
elements["setup-form"].elements = formInputs;
elements["setup-form"].reset = () => {
  for (const input of Object.values(formInputs)) input.value = "";
};

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

const appSource = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
eval(appSource);

function submitNames(names) {
  names.forEach((n, i) => {
    formInputs[`player${i}`].value = n;
  });
  elements["setup-form"].dispatch("submit", { preventDefault() {} });
}

function saveScore(matchIndex, a, b) {
  const card = elements["matches-list"].children[matchIndex];
  const row = card.children.find((c) => c.classList.contains("score-row"));
  row.children[0].value = String(a);
  row.children[2].value = String(b);
  row.children[3].click();
}

assert.ok(elements["setup-panel"].classList.contains("hidden") === false, "setup visible initially");
assert.ok(elements["tournament-panel"].classList.contains("hidden"), "tournament hidden initially");

submitNames(["Ana", "Ben", "Cleo", "Dan"]);
assert.ok(!elements["host-panel"].classList.contains("hidden"), "host invite panel shown after start");
assert.equal(elements["join-code"].textContent.length, 6, "6-character join code shown to host");
elements["host-continue-btn"].click();
assert.ok(elements["setup-panel"].classList.contains("hidden"), "setup hidden after start");
assert.ok(!elements["tournament-panel"].classList.contains("hidden"), "tournament visible after start");
assert.equal(elements["matches-list"].children.length, 3, "three rounds rendered");
assert.equal(elements["players-bar"].children.length, 4, "four player chips");
assert.equal(
  elements["tournament-status"].textContent,
  "0 of 3 matches played"
);

submitNames(["Ana", "ana", "Cleo", "Dan"]);
assert.ok(!elements["setup-error"].classList.contains("hidden"), "duplicate names rejected");
elements["setup-form"].dispatch("submit", { preventDefault() {} });

saveScore(0, 4, 2);
saveScore(1, 3, 4);
saveScore(2, 6, 1);

assert.equal(
  elements["tournament-status"].textContent,
  "Tournament complete — Ana wins!"
);

const tbody = elements["standings-table"].querySelector("tbody");
const rows = tbody.children.map((tr) => tr.children.map((td) => td.textContent));
assert.deepEqual(rows[0], ["1", "Ana", "3", "2", "13"]);
assert.deepEqual(rows[1], ["2", "Dan", "3", "2", "12"]);
assert.deepEqual(rows[2], ["3", "Ben", "3", "2", "9"]);
assert.deepEqual(rows[3], ["4", "Cleo", "3", "0", "6"]);

const saved = JSON.parse(storage.get("padelAmericano4.v1"));
assert.deepEqual(saved.players, ["Ana", "Ben", "Cleo", "Dan"]);
assert.equal(saved.matches[2].score.a, 6);

const thirdCard = elements["matches-list"].children[2];
assert.ok(thirdCard.classList.contains("played"), "played match marked");

elements["reset-btn"].click();
assert.ok(!elements["setup-panel"].classList.contains("hidden"), "reset returns to setup");
assert.equal(storage.has("padelAmericano4.v1"), false, "storage cleared on reset");

(async () => {
  submitNames(["Ana", "Ben", "Cleo", "Dan"]);
  elements["host-continue-btn"].click();
  await new Promise((r) => setTimeout(r, 50));
  const code = storage.get("padelAmericano4.unlock");
  assert.ok(code, "host device stores the join code");

  storage.delete("padelAmericano4.unlock");
  await refreshGate();
  render();
  assert.ok(!elements["gate-panel"].classList.contains("hidden"), "gate shown when code is missing");
  assert.ok(elements["tournament-panel"].classList.contains("hidden"), "editing hidden while locked");
  elements["gate-scoreboard-btn"].click();
  assert.ok(!elements["scoreboard-panel"].classList.contains("hidden"), "scoreboard viewable while locked");
  elements["back-btn"].click();
  assert.ok(!elements["gate-panel"].classList.contains("hidden"), "back from scoreboard returns to gate while locked");

  elements["gate-code"].value = "WRONG1";
  elements["gate-form"].dispatch("submit", { preventDefault() {} });
  await new Promise((r) => setTimeout(r, 20));
  assert.ok(!elements["gate-error"].classList.contains("hidden"), "wrong code rejected");

  elements["gate-code"].value = code.toLowerCase();
  elements["gate-form"].dispatch("submit", { preventDefault() {} });
  await new Promise((r) => setTimeout(r, 20));
  assert.ok(!elements["tournament-panel"].classList.contains("hidden"), "correct code unlocks editing");
  assert.ok(elements["gate-panel"].classList.contains("hidden"), "gate hidden after unlock");

  assert.ok(!elements["invite-btn"].classList.contains("hidden"), "invite button visible to host");
  elements["invite-btn"].click();
  assert.ok(!elements["host-panel"].classList.contains("hidden"), "invite button returns to QR screen");
  assert.ok(elements["tournament-panel"].classList.contains("hidden"), "game hidden on QR screen");
  elements["host-continue-btn"].click();
  assert.ok(!elements["tournament-panel"].classList.contains("hidden"), "continue returns to game");

  console.log("All UI smoke tests passed.");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
