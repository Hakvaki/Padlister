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
    assert.equal(state.codeHash, null);
    assert.ok(state.matches.every((m) => m.score === null));
    assert.ok(loadState(), "state persisted to disk");

    res = await fetch(`${base}/api/reset`, { method: "POST" });
    assert.equal(res.status, 200);

    res = await fetch(`${base}/api/tournament`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ players: ["Ana", "Ben", "Cleo", "Dan"], codeHash: "deadbeef" }),
    });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).codeHash, "deadbeef", "code hash stored");

    res = await fetch(`${base}/api/reset`, { method: "POST" });
    assert.equal(res.status, 200);

    res = await fetch(`${base}/api/tournament`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ players: ["Ana", "Ben", "Cleo", "Dan"] }),
    });
    assert.equal(res.status, 200, "tournament recreated for the 409 check");

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
    assert.equal(res.status, 200, "tie score accepted");
    res = await fetch(`${base}/api/matches/1/score`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ a: 2, b: -1 }),
    });
    assert.equal(res.status, 400, "negative score rejected");

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

    res = await fetch(`${base}/api/round`, { method: "POST" });
    assert.equal(res.status, 404, "adding a round without a tournament rejected");

    res = await fetch(`${base}/api/tournament`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ players: ["Ana", "Ben", "Cleo", "Dan"], mode: "bogus" }),
    });
    assert.equal(res.status, 400, "invalid mode rejected");

    res = await fetch(`${base}/api/tournament`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ players: ["Ana", "Ben", "Cleo", "Dan"], mode: "endless" }),
    });
    assert.equal(res.status, 200);
    let endless = await res.json();
    assert.equal(endless.mode, "endless");
    assert.equal(endless.finished, false);
    assert.equal(endless.matches.length, 1, "endless mode starts with round 1");

    res = await fetch(`${base}/api/round`, { method: "POST" });
    endless = await res.json();
    assert.equal(res.status, 200);
    assert.equal(endless.matches.length, 2);
    assert.equal(endless.matches[1].round, 2);

    res = await fetch(`${base}/api/matches/2/score`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ a: 5, b: 2 }),
    });
    assert.equal(res.status, 200);

    res = await fetch(`${base}/api/finish`, { method: "POST" });
    endless = await res.json();
    assert.equal(res.status, 200);
    assert.equal(endless.finished, true);

    res = await fetch(`${base}/api/finish`, { method: "POST" });
    assert.equal(res.status, 400, "finishing twice rejected");

    res = await fetch(`${base}/api/round`, { method: "POST" });
    assert.equal(res.status, 400, "adding a round after finish rejected");

    res = await fetch(`${base}/api/reset`, { method: "POST" });
    assert.equal(res.status, 200);

    res = await fetch(`${base}/api/tournament`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ players: ["Ana", "Ben", "Cleo", "Dan"] }),
    });
    assert.equal(res.status, 200);
    res = await fetch(`${base}/api/round`, { method: "POST" });
    assert.equal(res.status, 400, "adding a round in classic mode rejected");

    res = await fetch(`${base}/api/reset`, { method: "POST" });
    assert.equal(res.status, 200);

    process.env.PADEL_HOST_CODE_HASH = "host-hash-123";
    res = await fetch(`${base}/api/tournament`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ players: ["Ana", "Ben", "Cleo", "Dan"] }),
    });
    assert.equal(res.status, 403, "tournament start rejected without host code when configured");
    res = await fetch(`${base}/api/tournament`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ players: ["Ana", "Ben", "Cleo", "Dan"], hostCodeHash: "host-hash-123" }),
    });
    assert.equal(res.status, 200, "host code accepted");
    delete process.env.PADEL_HOST_CODE_HASH;
    await fetch(`${base}/api/reset`, { method: "POST" });

    res = await fetch(`${base}/api/results`, { method: "GET" });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), [], "results empty initially");

    res = await fetch(`${base}/api/results`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ players: ["Ana", "Ben", "Cleo", "Dan"], standings: [{ name: "Ana", points: 13 }], winner: "Ana" }),
    });
    assert.equal(res.status, 200);
    const row = await res.json();
    assert.ok(row.id, "result gets an id");

    res = await fetch(`${base}/api/results`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nope: true }),
    });
    assert.equal(res.status, 400, "malformed result rejected");

    res = await fetch(`${base}/api/results`, { method: "GET" });
    const rows = await res.json();
    assert.equal(rows.length, 1, "result persisted append-only");
    assert.equal(rows[0].winner, "Ana");
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
