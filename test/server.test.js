const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "padel-test-"));
process.env.PADEL_DATA_FILE = path.join(tmpDir, "tournament.json");

const { startServer, loadState } = require("../server.js");

async function main() {
  const server = startServer({ host: "127.0.0.1", port: 0, quiet: true });
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  try {
    let res = await fetch(`${base}/api/state`);
    assert.equal(res.status, 200);
    assert.equal(await res.json(), null, "no tournament initially");

    res = await fetch(`${base}/api/tournament`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ players: ["Ana", "ana", "Cleo", "Dan"] }),
    });
    assert.equal(res.status, 400, "duplicate names rejected");

    res = await fetch(`${base}/api/tournament`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ players: ["Ana", "Ben", "Cleo"] }),
    });
    assert.equal(res.status, 400, "three players rejected");

    res = await fetch(`${base}/api/tournament`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ players: ["Ana", "Ben", "Cleo", "Dan"] }),
    });
    assert.equal(res.status, 200);
    const state = await res.json();
    assert.deepEqual(state.players, ["Ana", "Ben", "Cleo", "Dan"]);
    assert.equal(state.matches.length, 3);
    assert.ok(state.matches.every((m) => m.score === null));
    assert.ok(loadState(), "state persisted to disk");

    res = await fetch(`${base}/api/tournament`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ players: ["Eve", "Finn", "Gus", "Hana"] }),
    });
    assert.equal(res.status, 409, "second tournament rejected while one is active");

    res = await fetch(`${base}/api/state`);
    assert.deepEqual((await res.json()).players, ["Ana", "Ben", "Cleo", "Dan"]);

    res = await fetch(`${base}/api/matches/1/score`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ a: 4, b: 2 }),
    });
    assert.equal(res.status, 200);
    assert.deepEqual((await res.json()).matches[0].score, { a: 4, b: 2 });

    res = await fetch(`${base}/api/matches/1/score`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ a: 3, b: 3 }),
    });
    assert.equal(res.status, 400, "tie score rejected");

    res = await fetch(`${base}/api/matches/99/score`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ a: 4, b: 2 }),
    });
    assert.equal(res.status, 404, "unknown match rejected");

    res = await fetch(`${base}/`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type"), /text\/html/);
    assert.match(await res.text(), /Padel Americano/);

    res = await fetch(`${base}/does-not-exist.js`);
    assert.equal(res.status, 404);

    res = await fetch(`${base}/api/reset`, { method: "POST" });
    assert.equal(res.status, 200);
    res = await fetch(`${base}/api/state`);
    assert.equal(await res.json(), null, "reset clears state");

    res = await fetch(`${base}/api/matches/1/score`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ a: 4, b: 2 }),
    });
    assert.equal(res.status, 404, "scoring without a tournament rejected");
  } finally {
    server.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  console.log("All server tests passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
