const assert = require("node:assert/strict");
const {
  generateSchedule,
  isValidScore,
  computeStandings,
  isTournamentComplete,
} = require("../logic.js");

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

testScheduleShape();
testScheduleRejectsWrongPlayerCount();
testEachPlayerPartnersWithEveryoneOnce();
testScoreValidation();
testStandingsAccumulateGames();
testStandingsTieBreaksDeterministically();
testStandingsIgnoreUnplayedMatches();
testTournamentComplete();

console.log("All logic tests passed.");
