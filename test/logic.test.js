const assert = require("node:assert/strict");
const {
  generateSchedule,
  createMatch,
  isValidMode,
  isValidScore,
  computeStandings,
  isTournamentComplete,
  generateJoinCode,
  hashJoinCode,
  sha256Hex,
  buildResult,
  sealResult,
  computeSeasonRanking,
  PAIRINGS,
} = require("../logic.js");
const nodeCrypto = require("node:crypto");

const PLAYERS = ["Ana", "Ben", "Cleo", "Dan"];

function testScheduleShape() {
  const matches = generateSchedule(4);
  assert.equal(matches.length, 3);
  assert.deepEqual(
    matches.map((m) => m.teams),
    [
      [[0, 1], [2, 3]],
      [[0, 2], [1, 3]],
      [[0, 3], [1, 2]],
    ]
  );
  assert.ok(matches.every((m) => m.score === null));
  assert.deepEqual(matches.map((m) => m.round), [1, 2, 3]);
}

function testScheduleRejectsWrongPlayerCount() {
  assert.throws(() => generateSchedule(3));
  assert.throws(() => generateSchedule(5));
  assert.throws(() => generateSchedule(0));
}

function testEachPlayerPartnersWithEveryoneOnce() {
  const matches = generateSchedule(4);
  const partners = Array.from({ length: 4 }, () => new Set());
  for (const m of matches) {
    for (const team of m.teams) {
      partners[team[0]].add(team[1]);
      partners[team[1]].add(team[0]);
    }
  }
  for (const p of partners) {
    assert.equal(p.size, 3);
  }
}

function testScoreValidation() {
  assert.ok(isValidScore({ a: 4, b: 2 }));
  assert.ok(isValidScore({ a: 0, b: 1 }));
  assert.ok(!isValidScore({ a: 3, b: 3 }));
  assert.ok(!isValidScore({ a: -1, b: 2 }));
  assert.ok(!isValidScore({ a: 1.5, b: 0 }));
  assert.ok(!isValidScore(null));
  assert.ok(!isValidScore({ a: 2 }));
}

function testStandingsAccumulateGames() {
  const matches = generateSchedule(4);
  matches[0].score = { a: 4, b: 2 };
  matches[1].score = { a: 3, b: 4 };
  matches[2].score = { a: 6, b: 1 };

  const standings = computeStandings(PLAYERS, matches);
  const byName = Object.fromEntries(standings.map((s) => [s.name, s]));

  assert.equal(byName["Ana"].points, 4 + 3 + 6);
  assert.equal(byName["Ben"].points, 4 + 4 + 1);
  assert.equal(byName["Cleo"].points, 2 + 3 + 1);
  assert.equal(byName["Dan"].points, 2 + 4 + 6);

  assert.equal(byName["Ana"].played, 3);
  assert.equal(byName["Ana"].won, 2);
  assert.equal(byName["Ben"].won, 2);
  assert.equal(byName["Cleo"].won, 0);
  assert.equal(byName["Dan"].won, 2);

  assert.equal(standings[0].name, "Ana");
}

function testStandingsTieBreaksDeterministically() {
  const matches = generateSchedule(4);
  matches[0].score = { a: 4, b: 1 };
  matches[1].score = { a: 5, b: 2 };
  matches[2].score = { a: 1, b: 4 };

  const standings = computeStandings(PLAYERS, matches);

  assert.deepEqual(
    standings.map((s) => s.name),
    ["Ana", "Ben", "Cleo", "Dan"]
  );
  for (const s of standings.slice(0, 3)) {
    assert.equal(s.points, 10);
    assert.equal(s.won, 2);
    assert.equal(s.played, 3);
  }
  assert.equal(standings[3].points, 4);
}

function testStandingsIgnoreUnplayedMatches() {
  const matches = generateSchedule(4);
  matches[0].score = { a: 5, b: 0 };
  const standings = computeStandings(PLAYERS, matches);
  const byName = Object.fromEntries(standings.map((s) => [s.name, s]));
  assert.equal(byName["Cleo"].played, 1);
  assert.equal(byName["Cleo"].points, 0);
  assert.ok(standings.every((s) => s.played <= 1));
}

function testTournamentComplete() {
  const matches = generateSchedule(4);
  assert.ok(!isTournamentComplete(matches));
  matches[0].score = { a: 4, b: 2 };
  matches[1].score = { a: 2, b: 4 };
  assert.ok(!isTournamentComplete(matches));
  matches[2].score = { a: 4, b: 0 };
  assert.ok(isTournamentComplete(matches));
}

function testCreateMatchCyclesPairings() {
  for (let i = 0; i < 7; i++) {
    const m = createMatch(i);
    assert.equal(m.id, i + 1);
    assert.equal(m.round, i + 1);
    assert.deepEqual(m.teams, PAIRINGS[i % PAIRINGS.length].map((t) => [...t]));
    assert.equal(m.score, null);
  }
  assert.deepEqual(generateSchedule(4), [createMatch(0), createMatch(1), createMatch(2)]);
  assert.throws(() => createMatch(-1));
  assert.throws(() => createMatch(1.5));
}

function testModeValidation() {
  assert.ok(isValidMode("classic"));
  assert.ok(isValidMode("endless"));
  assert.ok(!isValidMode(""));
  assert.ok(!isValidMode("tournament"));
}

function testJoinCodeGeneration() {
  const code = generateJoinCode();
  assert.equal(code.length, 6);
  assert.match(code, /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
  assert.notEqual(generateJoinCode(), generateJoinCode());
}

async function testJoinCodeHash() {
  const hash = await hashJoinCode("abc123");
  assert.equal(hash, nodeCrypto.createHash("sha256").update("ABC123").digest("hex"));
  assert.equal(await hashJoinCode(" ABC123 "), hash, "hash normalizes case and whitespace");
  assert.notEqual(await hashJoinCode("ABC124"), hash);
}

testScheduleShape();
testCreateMatchCyclesPairings();
testModeValidation();
async function testResultSealingAndRanking() {
  assert.equal(await sha256Hex("abc"), nodeCrypto.createHash("sha256").update("abc").digest("hex"));

  const state = {
    players: ["Ana", "Ben", "Cleo", "Dan"],
    mode: "classic",
    matches: generateSchedule(4),
  };
  state.matches[0].score = { a: 4, b: 2 };
  state.matches[1].score = { a: 3, b: 4 };
  state.matches[2].score = { a: 6, b: 1 };

  const result = buildResult(state, null);
  assert.equal(result.winner, "Ana");
  assert.equal(result.prevHash, null);
  assert.equal(result.standings.length, 4);

  const sealed = await sealResult(result);
  assert.match(sealed.hash, /^[0-9a-f]{64}$/);
  assert.equal(sealed.hash, await sha256Hex(JSON.stringify({ ...result, prevHash: null, hash: null })));

  const r2 = await sealResult(buildResult(state, sealed.hash));
  assert.equal(r2.prevHash, sealed.hash);

  const ranking = computeSeasonRanking([sealed, r2]);
  assert.equal(ranking[0].name, "Ana");
  assert.equal(ranking[0].tournaments, 2);
  assert.equal(ranking[0].wins, 2);
  assert.equal(ranking[0].points, 26);
}

testJoinCodeGeneration();
testJoinCodeHash()
  .then(testResultSealingAndRanking)
  .then(() => console.log("All logic tests passed."));
testScheduleRejectsWrongPlayerCount();
testEachPlayerPartnersWithEveryoneOnce();
testScoreValidation();
testStandingsAccumulateGames();
testStandingsTieBreaksDeterministically();
testStandingsIgnoreUnplayedMatches();
testTournamentComplete();


