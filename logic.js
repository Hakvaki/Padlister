const PAIRINGS = [
  [[0, 1], [2, 3]],
  [[0, 2], [1, 3]],
  [[0, 3], [1, 2]],
];

function createMatch(roundIndex) {
  if (!Number.isInteger(roundIndex) || roundIndex < 0) {
    throw new Error("roundIndex must be an integer >= 0");
  }
  const teams = PAIRINGS[roundIndex % PAIRINGS.length];
  return {
    id: roundIndex + 1,
    round: roundIndex + 1,
    teams: teams.map((team) => [...team]),
    score: null,
  };
}

function generateSchedule(playerCount = 4) {
  if (!Number.isInteger(playerCount) || playerCount < 2) {
    throw new Error("playerCount must be an integer >= 2");
  }
  if (playerCount !== 4) {
    throw new Error("Classic Americano is only supported for 4 players");
  }
  return [0, 1, 2].map(createMatch);
}

function isValidMode(mode) {
  return mode === "classic" || mode === "endless";
}

const JOIN_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function generateJoinCode(length = 6) {
  let out = "";
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    for (let i = 0; i < length; i++) out += JOIN_CODE_ALPHABET[bytes[i] % JOIN_CODE_ALPHABET.length];
  } else {
    for (let i = 0; i < length; i++) {
      out += JOIN_CODE_ALPHABET[Math.floor(Math.random() * JOIN_CODE_ALPHABET.length)];
    }
  }
  return out;
}

async function hashJoinCode(code) {
  const input = String(code).trim().toUpperCase();
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
    return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  let h = 0xcbf29ce484222325n;
  for (let i = 0; i < input.length; i++) {
    h ^= BigInt(input.charCodeAt(i));
    h = (h * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return h.toString(16).padStart(16, "0");
}

function isValidScore(score) {
  if (!score) return false;
  const { a, b } = score;
  return (
    Number.isInteger(a) &&
    Number.isInteger(b) &&
    a >= 0 &&
    b >= 0 &&
    a !== b
  );
}

function computeStandings(players, matches) {
  const stats = players.map((name, index) => ({
    index,
    name,
    played: 0,
    won: 0,
    points: 0,
    gamesFor: 0,
    gamesAgainst: 0,
  }));

  for (const match of matches) {
    if (!isValidScore(match.score)) continue;
    const { a, b } = match.score;
    const winners = a > b ? 0 : 1;
    for (const teamIndex of [0, 1]) {
      const teamGames = teamIndex === 0 ? a : b;
      const opponentGames = teamIndex === 0 ? b : a;
      for (const playerIndex of match.teams[teamIndex]) {
        const s = stats[playerIndex];
        s.played += 1;
        s.points += teamGames;
        s.gamesFor += teamGames;
        s.gamesAgainst += opponentGames;
        if (teamIndex === winners) s.won += 1;
      }
    }
  }

  return stats.sort((x, y) => {
    if (y.points !== x.points) return y.points - x.points;
    if (y.won !== x.won) return y.won - x.won;
    const diffX = x.gamesFor - x.gamesAgainst;
    const diffY = y.gamesFor - y.gamesAgainst;
    if (diffY !== diffX) return diffY - diffX;
    return x.name.localeCompare(y.name);
  });
}

function isTournamentComplete(matches) {
  return matches.every((m) => isValidScore(m.score));
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { generateSchedule, createMatch, isValidMode, isValidScore, computeStandings, isTournamentComplete, generateJoinCode, hashJoinCode, PAIRINGS };
}
