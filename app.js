const STORAGE_KEY = "padelAmericano4.v1";

const setupPanel = document.getElementById("setup-panel");
const tournamentPanel = document.getElementById("tournament-panel");
const setupForm = document.getElementById("setup-form");
const setupError = document.getElementById("setup-error");
const playersBar = document.getElementById("players-bar");
const standingsTable = document.getElementById("standings-table");
const matchesList = document.getElementById("matches-list");
const tournamentStatus = document.getElementById("tournament-status");
const resetBtn = document.getElementById("reset-btn");

let state = null;

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.players) || parsed.players.length !== 4) return null;
    if (!Array.isArray(parsed.matches) || parsed.matches.length !== 3) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function startTournament(players) {
  state = { players, matches: generateSchedule(4) };
  saveState();
  render();
}

function teamNames(team) {
  return team.map((i) => state.players[i]).join(" & ");
}

function render() {
  const hasState = state !== null;
  setupPanel.classList.toggle("hidden", hasState);
  tournamentPanel.classList.toggle("hidden", !hasState);
  if (!hasState) return;

  playersBar.innerHTML = "";
  for (const name of state.players) {
    const chip = document.createElement("span");
    chip.className = "player-chip";
    chip.textContent = name;
    playersBar.appendChild(chip);
  }

  renderStandings();
  renderMatches();
}

function renderStandings() {
  const standings = computeStandings(state.players, state.matches);
  const tbody = standingsTable.querySelector("tbody");
  tbody.innerHTML = "";
  standings.forEach((s, rank) => {
    const tr = document.createElement("tr");
    if (rank === 0) tr.className = "first";
    for (const value of [rank + 1, s.name, s.played, s.won, s.points]) {
      const td = document.createElement("td");
      td.textContent = value;
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  });

  tournamentStatus.textContent = isTournamentComplete(state.matches)
    ? `Tournament complete — ${standings[0].name} wins!`
    : `${state.matches.filter((m) => isValidScore(m.score)).length} of 3 matches played`;
}

function renderMatches() {
  matchesList.innerHTML = "";
  for (const match of state.matches) {
    matchesList.appendChild(buildMatchCard(match));
  }
}

function buildMatchCard(match) {
  const card = document.createElement("div");
  card.className = "match-card" + (isValidScore(match.score) ? " played" : "");

  const title = document.createElement("div");
  title.className = "match-title";
  title.textContent = `Round ${match.round}`;
  card.appendChild(title);

  const teams = document.createElement("div");
  teams.className = "teams";
  const played = isValidScore(match.score);
  const teamEls = match.teams.map((team, i) => {
    const el = document.createElement("div");
    el.className = "team" + (played && (match.score.a > match.score.b) === (i === 0) ? " winner" : "");
    el.textContent = teamNames(team);
    return el;
  });
  const vs = document.createElement("span");
  vs.className = "vs";
  vs.textContent = "vs";
  teams.append(teamEls[0], vs, teamEls[1]);
  card.appendChild(teams);

  if (played) {
    const display = document.createElement("div");
    display.className = "score-display";
    display.textContent = `${match.score.a} – ${match.score.b}`;
    card.appendChild(display);
  }

  const row = document.createElement("div");
  row.className = "score-row";

  const inputA = document.createElement("input");
  inputA.type = "number";
  inputA.min = "0";
  inputA.placeholder = "Games";
  inputA.setAttribute("aria-label", `Games ${teamNames(match.teams[0])}`);
  if (played) inputA.value = match.score.a;

  const dash = document.createElement("span");
  dash.textContent = "–";

  const inputB = document.createElement("input");
  inputB.type = "number";
  inputB.min = "0";
  inputB.placeholder = "Games";
  inputB.setAttribute("aria-label", `Games ${teamNames(match.teams[1])}`);
  if (played) inputB.value = match.score.b;

  const saveBtn = document.createElement("button");
  saveBtn.className = "btn small";
  saveBtn.textContent = played ? "Update" : "Save";

  const error = document.createElement("span");
  error.className = "score-error";

  saveBtn.addEventListener("click", () => {
    const score = { a: Number(inputA.value), b: Number(inputB.value) };
    if (!isValidScore(score)) {
      error.textContent = "Enter two different non-negative game scores.";
      return;
    }
    match.score = score;
    saveState();
    render();
  });

  row.append(inputA, dash, inputB, saveBtn, error);
  card.appendChild(row);
  return card;
}

setupForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const players = [0, 1, 2, 3].map((i) => {
    const value = setupForm.elements[`player${i}`].value.trim();
    return value;
  });

  if (players.some((p) => p.length === 0)) {
    setupError.textContent = "All four player names are required.";
    setupError.classList.remove("hidden");
    return;
  }
  const unique = new Set(players.map((p) => p.toLowerCase()));
  if (unique.size !== 4) {
    setupError.textContent = "Player names must be unique.";
    setupError.classList.remove("hidden");
    return;
  }

  setupError.classList.add("hidden");
  startTournament(players);
});

resetBtn.addEventListener("click", () => {
  localStorage.removeItem(STORAGE_KEY);
  state = null;
  setupForm.reset();
  render();
});

state = loadState();
render();
