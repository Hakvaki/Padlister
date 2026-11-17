const STORAGE_KEY = "padelAmericano4.v1";
const UNLOCK_KEY = "padelAmericano4.unlock";
const HOST_KEY = "padelAmericano4.host";
const POLL_INTERVAL_MS = 2000;

const setupPanel = document.getElementById("setup-panel");
const tournamentPanel = document.getElementById("tournament-panel");
const setupForm = document.getElementById("setup-form");
const setupError = document.getElementById("setup-error");
const playersBar = document.getElementById("players-bar");
const standingsTable = document.getElementById("standings-table");
const matchesList = document.getElementById("matches-list");
const tournamentStatus = document.getElementById("tournament-status");
const resetBtn = document.getElementById("reset-btn");
const scoreboardBtn = document.getElementById("scoreboard-btn");
const addRoundBtn = document.getElementById("add-round-btn");
const finishBtn = document.getElementById("finish-btn");
const scoreboardPanel = document.getElementById("scoreboard-panel");
const scoreboardRound = document.getElementById("scoreboard-round");
const scoreboardTable = document.getElementById("scoreboard-table");
const scoreboardMatches = document.getElementById("scoreboard-matches");
const scoreboardStatus = document.getElementById("scoreboard-status");
const backBtn = document.getElementById("back-btn");
const hostPanel = document.getElementById("host-panel");
const qrImg = document.getElementById("qr-img");
const joinCode = document.getElementById("join-code");
const joinUrl = document.getElementById("join-url");
const hostContinueBtn = document.getElementById("host-continue-btn");
const inviteBtn = document.getElementById("invite-btn");
const gatePanel = document.getElementById("gate-panel");
const gateForm = document.getElementById("gate-form");
const gateCodeInput = document.getElementById("gate-code");
const gateError = document.getElementById("gate-error");
const gateScoreboardBtn = document.getElementById("gate-scoreboard-btn");
const historyBtn = document.getElementById("history-btn");
const historyPanel = document.getElementById("history-panel");
const historyRanking = document.getElementById("history-ranking");
const historyList = document.getElementById("history-list");
const historyBackBtn = document.getElementById("history-back-btn");
const nameInputs = document.getElementById("name-inputs");
const addPlayerBtn = document.getElementById("add-player-btn");
const courtsSelect = document.getElementById("courts-select");
const singlesSelect = document.getElementById("singles-select");

let state = null;
let pollTimer = null;
let view = "game";
let unlocked = false;
let isHost = false;
let historyCache = null;

const FB_TOKEN_KEY = "padelAmericano4.fbToken";

async function dbToken() {
  const apiKey = typeof window !== "undefined" ? window.PADEL_FIREBASE_API_KEY : "";
  if (!apiKey) return null;
  try {
    const saved = JSON.parse(localStorage.getItem(FB_TOKEN_KEY) || "null");
    if (saved && saved.expiresAt > Date.now() + 60000) return saved.token;
  } catch {
    // re-auth below
  }
  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ returnSecureToken: true }),
  });
  if (!res.ok) throw new Error(`Firebase auth failed (${res.status})`);
  const data = await res.json();
  const entry = { token: data.idToken, expiresAt: Date.now() + Number(data.expiresIn) * 1000 };
  localStorage.setItem(FB_TOKEN_KEY, JSON.stringify(entry));
  return entry.token;
}

async function dbFetch(path, options = {}) {
  let url = `${dbUrl()}/${path}`;
  const token = await dbToken();
  if (token) url += `${path.includes("?") ? "&" : "?"}auth=${token}`;
  return fetch(url, options);
}

function setView(next) {
  view = next === "host" && !isHost ? "game" : next;
  if (isBrowser() && typeof location !== "undefined" && typeof history !== "undefined") {
    const hash = view === "host" ? "#invite" : view === "scoreboard" ? "#scoreboard" : view === "history" ? "#history" : "#game";
    history.replaceState(null, "", hash);
  }
}

function applyHash() {
  if (!isBrowser() || typeof location === "undefined") return;
  const hash = location.hash.replace("#", "");
  if (hash === "scoreboard") setView("scoreboard");
  else if (hash === "invite") setView("host");
  else if (hash === "history") setView("history");
  else if (hash === "game") setView("game");
}

function hostHashConfigured() {
  return typeof window !== "undefined" && Boolean(window.PADEL_HOST_CODE_HASH);
}

function isBrowser() {
  return typeof window !== "undefined" && typeof fetch === "function";
}

function dbUrl() {
  return (typeof window !== "undefined" && window.PADEL_DB_URL) || "";
}

function canonical(value) {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object") {
    return "{" + Object.keys(value).sort().map((k) => JSON.stringify(k) + ":" + canonical(value[k])).join(",") + "}";
  }
  return JSON.stringify(value);
}

function isValidState(parsed) {
  return (
    parsed !== null &&
    typeof parsed === "object" &&
    Array.isArray(parsed.players) &&
    isValidPlayerCount(parsed.players.length) &&
    Array.isArray(parsed.matches)
  );
}

function normalizeState(parsed) {
  if (!isValidState(parsed)) return null;
  return {
    players: parsed.players,
    mode: parsed.mode === "endless" ? "endless" : "classic",
    finished: Boolean(parsed.finished),
    codeHash: typeof parsed.codeHash === "string" ? parsed.codeHash : null,
    resultArchived: Boolean(parsed.resultArchived),
    courts: isValidCourtCount(parsed.courts) ? parsed.courts : 1,
    singles: isValidSinglesCount(parsed.singles, isValidCourtCount(parsed.courts) ? parsed.courts : 1) ? parsed.singles : 0,
    matches: parsed.matches.map((m) => ({ ...m, score: m.score || null })),
  };
}

async function fetchSharedState() {
  if (dbUrl()) {
    const res = await dbFetch("tournament.json", { cache: "no-store" });
    if (!res.ok) throw new Error(`Database read failed (${res.status})`);
    const text = await res.text();
    return normalizeState(text && text !== "null" ? JSON.parse(text) : null);
  }
  return api("api/state");
}

async function loadHistory() {
  if (dbUrl()) {
    const res = await dbFetch("results.json", { cache: "no-store" });
    if (!res.ok) throw new Error(`Database read failed (${res.status})`);
    const data = await res.json();
    return data ? Object.entries(data).map(([id, r]) => ({ id, ...r })) : [];
  }
  return api("api/results");
}

async function archiveResult(result) {
  if (dbUrl()) {
    const prevRes = await dbFetch("meta/lastHash.json", { cache: "no-store" });
    const prevText = prevRes.ok ? await prevRes.text() : "null";
    const prevHash = prevText && prevText !== "null" ? JSON.parse(prevText) : null;
    const sealed = await sealResult({ ...result, prevHash });
    const res = await dbFetch("results.json", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sealed),
    });
    if (!res.ok) throw new Error(`Archive write failed (${res.status})`);
    await dbFetch("meta/lastHash.json", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sealed.hash),
    });
    return sealed;
  }
  return api("api/results", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(result),
  });
}

async function voidResult(id) {
  const original = (historyCache || []).find((r) => r.id === id);
  const tombstone = {
    endedAt: new Date().toISOString(),
    mode: original ? original.mode : "classic",
    players: [],
    matches: [],
    standings: [],
    winner: "",
    void: true,
    supersedes: id,
  };
  await archiveResult(tombstone);
  historyCache = null;
  render();
}

async function maybeArchive() {
  if (!isBrowser() || !state || state.resultArchived) return;
  const done = state.mode === "endless" ? state.finished : isTournamentComplete(state.matches);
  if (!done) return;
  state.resultArchived = true;
  saveState();
  render();
  try {
    await archiveResult(buildResult(state, null));
  } catch {
    state.resultArchived = false;
    saveState();
  }
}

async function publish(action, payload) {
  if (dbUrl()) {
    if (action === "reset") {
      const res = await dbFetch("tournament.json", { method: "DELETE" });
      if (!res.ok) throw new Error(`Database reset failed (${res.status})`);
      return;
    }
    const res = await dbFetch("tournament.json", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(state),
    });
    if (!res.ok) throw new Error(`Database write failed (${res.status})`);
    return;
  }
  if (action === "tournament") {
    return api("api/tournament", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ players: payload.players, mode: payload.mode, courts: payload.courts || 1, singles: payload.singles || 0, codeHash: payload.codeHash || null, hostCodeHash: payload.hostCodeHash || null }),
    });
  }
  if (action === "round") {
    return api("api/round", { method: "POST" });
  }
  if (action === "finish") {
    return api("api/finish", { method: "POST" });
  }
  if (action === "score") {
    return api(`api/matches/${payload.id}/score`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload.score),
    });
  }
  if (action === "reset") {
    return api("api/reset", { method: "POST" });
  }
}

async function api(path, options) {
  const res = await fetch(path, options);
  if (!res.ok) {
    const err = new Error(`Request failed (${res.status})`);
    err.status = res.status;
    try {
      const data = await res.json();
      if (data && data.error) err.message = data.error;
    } catch {
      // keep generic message
    }
    throw err;
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return normalizeState(JSON.parse(raw));
  } catch {
    return null;
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function startTournament(players, mode, courts, singles, hostCodeHash) {
  const code = generateJoinCode();
  localStorage.setItem(UNLOCK_KEY, code);
  unlocked = true;
  setView("host");
  state = {
    players,
    mode,
    courts,
    singles,
    finished: false,
    codeHash: null,
    matches: mode === "endless" ? generateRound(players.length, 0, courts, singles).matches : generateRounds(players.length, courts, 3, singles),
  };
  saveState();
  render();
  hashJoinCode(code).then((codeHash) => {
    if (!state) return;
    state.codeHash = codeHash;
    saveState();
    render();
    if (isBrowser()) {
      publish("tournament", { players, mode, courts, singles, codeHash, hostCodeHash }).catch((err) => {
        if (err && err.status === 409) syncShared();
      });
    }
  });
}

async function refreshGate() {
  if (hostHashConfigured()) {
    const savedHost = localStorage.getItem(HOST_KEY);
    isHost = savedHost !== null && (await hashJoinCode(savedHost)) === window.PADEL_HOST_CODE_HASH;
  } else {
    isHost = true;
  }
  if (!state) {
    unlocked = false;
    return;
  }
  if (!state.codeHash) {
    unlocked = true;
    return;
  }
  const saved = localStorage.getItem(UNLOCK_KEY);
  unlocked = saved !== null && (await hashJoinCode(saved)) === state.codeHash;
}

async function syncShared() {
  if (!isBrowser()) return;
  try {
    const incoming = await fetchSharedState();
    if (incoming && canonical(incoming) !== canonical(state)) {
      state = incoming;
      saveState();
      await refreshGate();
      renderPreservingFocus();
    } else if (!incoming && state !== null) {
      state = null;
      unlocked = false;
      saveState();
      renderPreservingFocus();
    }
  } catch {
    // offline: keep local state
  }
}

function renderPreservingFocus() {
  const active = typeof document !== "undefined" ? document.activeElement : null;
  const label = active && typeof active.getAttribute === "function" ? active.getAttribute("aria-label") : null;
  const value = active ? active.value : null;
  render();
  if (label && typeof document.querySelector === "function") {
    const next = document.querySelector(`input[aria-label="${label}"]`);
    if (next) {
      next.value = value;
      next.focus();
    }
  }
}

function startPolling() {
  if (!isBrowser() || pollTimer !== null) return;
  pollTimer = setInterval(syncShared, POLL_INTERVAL_MS);
}

function teamNames(team) {
  return team.map((i) => state.players[i]).join(" & ");
}

function render() {
  const hasState = state !== null;
  setupPanel.classList.toggle("hidden", hasState);
  gatePanel.classList.toggle("hidden", !(hasState && !unlocked));
  hostPanel.classList.toggle("hidden", !(hasState && isHost && view === "host"));
  tournamentPanel.classList.toggle("hidden", !(hasState && unlocked && view === "game"));
  scoreboardPanel.classList.toggle("hidden", !(hasState && view === "scoreboard"));
  historyPanel.classList.toggle("hidden", !(hasState && view === "history"));
  if (!hasState) return;
  if (view === "host") renderHost();
  if (view === "history") renderHistory();
  maybeArchive();

  const endlessActive = state.mode === "endless" && !state.finished;
  addRoundBtn.classList.toggle("hidden", !endlessActive);
  finishBtn.classList.toggle("hidden", state.mode !== "endless" || state.finished);
  resetBtn.classList.toggle("hidden", !isHost);
  inviteBtn.classList.toggle("hidden", !isHost);

  playersBar.innerHTML = "";
  for (const name of state.players) {
    const chip = document.createElement("span");
    chip.className = "player-chip";
    chip.textContent = name;
    playersBar.appendChild(chip);
  }

  renderStandings();
  renderMatches();
  renderScoreboard();
}

function renderHost() {
  const code = localStorage.getItem(UNLOCK_KEY) || "";
  joinCode.textContent = code;
  if (typeof location !== "undefined") {
    const base = `${location.origin}${location.pathname}`;
    const url = `${base}?join=${encodeURIComponent(code)}`;
    joinUrl.textContent = url;
    qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=8&data=${encodeURIComponent(url)}`;
  }
}

function statusText(standings) {
  const played = state.matches.filter((m) => isValidScore(m.score)).length;
  if (state.mode === "endless") {
    const round = state.matches.length ? Math.max(...state.matches.map((m) => m.round)) : 0;
    if (state.finished) return `Game over — ${standings[0].name} wins!`;
    return `Round ${round} · ${played} of ${state.matches.length} matches played`;
  }
  return isTournamentComplete(state.matches)
    ? `Tournament complete — ${standings[0].name} wins!`
    : `${played} of ${state.matches.length} matches played`;
}

function renderHistory() {
  const tbody = historyRanking.querySelector("tbody");
  tbody.innerHTML = "";
  historyList.innerHTML = "";
  if (!historyCache) {
    loadHistory()
      .then((rows) => {
        historyCache = rows;
        renderHistory();
      })
      .catch(() => {
        historyList.innerHTML = "";
        const p = document.createElement("p");
        p.className = "history-empty";
        p.textContent = "Could not load history.";
        historyList.appendChild(p);
      });
    const loading = document.createElement("p");
    loading.className = "history-empty";
    loading.textContent = "Loading…";
    historyList.appendChild(loading);
    return;
  }
  const ranking = computeSeasonRanking(historyCache);
  ranking.forEach((r, rank) => {
    const tr = document.createElement("tr");
    if (rank === 0) tr.className = "first";
    for (const value of [rank + 1, r.name, r.tournaments, r.wins, r.points]) {
      const td = document.createElement("td");
      td.textContent = value;
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  });
  const sorted = [...historyCache].sort((a, b) => (b.endedAt || "").localeCompare(a.endedAt || ""));
  if (sorted.length === 0) {
    const p = document.createElement("p");
    p.className = "history-empty";
    p.textContent = "No finished tournaments yet.";
    historyList.appendChild(p);
    return;
  }
  const superseded = new Set();
  for (const r of sorted) if (r.supersedes) superseded.add(r.supersedes);
  for (const r of sorted) {
    const div = document.createElement("div");
    div.className = "history-item" + (r.void || superseded.has(r.id) ? " voided" : "");
    const date = r.endedAt ? new Date(r.endedAt).toLocaleString() : "";
    const scoreLine = (r.standings || []).map((s) => `${s.name} ${s.points}`).join(" · ");
    const main = document.createElement("div");
    const winner = document.createElement("span");
    winner.className = "winner";
    winner.textContent = r.void ? "Voided" : `🏆 ${r.winner}`;
    main.append(winner, document.createTextNode(` — ${r.mode === "endless" ? "Endless" : "Classic"} · ${date}`));
    if (r.void) main.append(document.createTextNode(" (correction entry)"));
    else if (superseded.has(r.id)) main.append(document.createTextNode(" (superseded)"));
    const sub = document.createElement("div");
    sub.textContent = scoreLine;
    div.append(main, sub);
    if (isHost && !r.void && !superseded.has(r.id)) {
      const btn = document.createElement("button");
      btn.className = "btn small";
      btn.textContent = "Void result";
      btn.addEventListener("click", () => {
        voidResult(r.id).catch(() => {});
      });
      div.appendChild(btn);
    }
    historyList.appendChild(div);
  }
}

function renderScoreboard() {
  const standings = computeStandings(state.players, state.matches);
  scoreboardRound.textContent = state.mode === "endless"
    ? (state.finished ? "Game over" : `Round ${state.matches.length ? Math.max(...state.matches.map((m) => m.round)) : 0}`)
    : `Classic · ${state.matches.filter((m) => isValidScore(m.score)).length} of ${state.matches.length} played`;

  const tbody = scoreboardTable.querySelector("tbody");
  tbody.innerHTML = "";
  standings.forEach((s, rank) => {
    const tr = document.createElement("tr");
    if (rank === 0) tr.className = "first";
    for (const value of [rank + 1, s.name, s.won, s.points]) {
      const td = document.createElement("td");
      td.textContent = value;
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  });

  scoreboardMatches.innerHTML = "";
  for (const match of state.matches) {
    if (!isValidScore(match.score)) continue;
    const div = document.createElement("div");
    div.className = "scoreboard-match";
    div.textContent = `R${match.round}: ${teamNames(match.teams[0])} ${match.score.a} – ${match.score.b} ${teamNames(match.teams[1])}`;
    scoreboardMatches.appendChild(div);
  }

  scoreboardStatus.textContent = statusText(standings);
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

  tournamentStatus.textContent = statusText(standings);
}

function restingFor(round) {
  return generateRound(state.players.length, round - 1, state.courts || 1, state.singles || 0).resting;
}

function renderMatches() {
  matchesList.innerHTML = "";
  const byRound = new Map();
  for (const match of state.matches) {
    if (!byRound.has(match.round)) byRound.set(match.round, []);
    byRound.get(match.round).push(match);
  }
  for (const [round, roundMatches] of byRound) {
    const header = document.createElement("h3");
    header.className = "round-header";
    const resting = restingFor(round);
    header.textContent = `Round ${round}` + (resting.length ? ` — resting: ${resting.map((i) => state.players[i]).join(", ")}` : "");
    matchesList.appendChild(header);
    for (const match of roundMatches) {
      matchesList.appendChild(buildMatchCard(match));
    }
  }
}

function buildMatchCard(match) {
  const card = document.createElement("div");
  card.className = "match-card" + (isValidScore(match.score) ? " played" : "");

  const title = document.createElement("div");
  title.className = "match-title";
  title.textContent = `Round ${match.round} · Court ${match.court || 1}${match.singles ? " · 1v1" : ""}`;
  card.appendChild(title);

  const teams = document.createElement("div");
  teams.className = "teams";
  const played = isValidScore(match.score);
  const teamEls = match.teams.map((team, i) => {
    const el = document.createElement("div");
    el.className = "team" + (played && match.score.a !== match.score.b && (match.score.a > match.score.b) === (i === 0) ? " winner" : "");
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
      error.textContent = "Enter two non-negative game scores.";
      return;
    }
    match.score = score;
    saveState();
    render();
    if (isBrowser()) {
      publish("score", { id: match.id, score }).catch((err) => {
        if (err && err.status === 404) syncShared();
      });
    }
  });

  row.append(inputA, dash, inputB, saveBtn, error);
  card.appendChild(row);
  return card;
}

function formElements(form) {
  if (!form.elements) return [];
  if (typeof form.elements.length === "number") return Array.from(form.elements);
  return Object.values(form.elements);
}

function readPlayers() {
  return formElements(setupForm)
    .filter((el) => el && typeof el.name === "string" && /^player\d+$/.test(el.name))
    .sort((a, b) => Number(a.name.slice(6)) - Number(b.name.slice(6)))
    .map((el) => el.value.trim());
}

function updateCourtsDefault() {
  const rows = nameInputs.querySelectorAll(".player-row");
  courtsSelect.value = String(Math.min(MAX_COURTS, Math.max(1, Math.ceil(rows.length / 4))));
}

addPlayerBtn.addEventListener("click", () => {
  const rows = nameInputs.querySelectorAll(".player-row");
  if (rows.length >= MAX_PLAYERS) return;
  const row = document.createElement("div");
  row.className = "player-row";
  const input = document.createElement("input");
  input.type = "text";
  input.name = `player${rows.length}`;
  input.maxLength = 20;
  input.placeholder = `Player ${rows.length + 1}`;
  input.required = true;
  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "btn small remove-player-btn";
  remove.setAttribute("aria-label", "Remove player");
  remove.textContent = "×";
  row.append(input, remove);
  nameInputs.appendChild(row);
  updateCourtsDefault();
});

nameInputs.addEventListener("click", (event) => {
  if (!event.target.classList || !event.target.classList.contains("remove-player-btn")) return;
  const rows = nameInputs.querySelectorAll(".player-row");
  if (rows.length > MIN_PLAYERS) event.target.closest(".player-row").remove();
  updateCourtsDefault();
});

setupForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const players = readPlayers();

  if (!isValidPlayerCount(players.length)) {
    setupError.textContent = `Enter between ${MIN_PLAYERS} and ${MAX_PLAYERS} player names.`;
    setupError.classList.remove("hidden");
    return;
  }
  if (players.some((p) => p.length === 0)) {
    setupError.textContent = "All player names are required.";
    setupError.classList.remove("hidden");
    return;
  }
  const unique = new Set(players.map((p) => p.toLowerCase()));
  if (unique.size !== players.length) {
    setupError.textContent = "Player names must be unique.";
    setupError.classList.remove("hidden");
    return;
  }
  const courtsEl = setupForm.elements["courts"] || courtsSelect;
  const courts = Number(courtsEl ? courtsEl.value : 1);
  if (!isValidCourtCount(courts)) {
    setupError.textContent = `Choose between 1 and ${MAX_COURTS} courts.`;
    setupError.classList.remove("hidden");
    return;
  }
  const singlesEl = setupForm.elements["singles"] || singlesSelect;
  const singles = Number(singlesEl ? singlesEl.value : 0);
  if (!isValidSinglesCount(singles, courts)) {
    setupError.textContent = `1v1 courts must be between 0 and the number of courts (${courts}).`;
    setupError.classList.remove("hidden");
    return;
  }

  let hostCodeHash = null;
  if (hostHashConfigured()) {
    const hostInput = setupForm.elements["hostCode"];
    const hostCode = hostInput ? hostInput.value.trim() : "";
    hostCodeHash = hostCode ? await hashJoinCode(hostCode) : null;
    if (!hostCodeHash || hostCodeHash !== window.PADEL_HOST_CODE_HASH) {
      setupError.textContent = "Only the host can start a tournament — enter the host code.";
      setupError.classList.remove("hidden");
      return;
    }
    localStorage.setItem(HOST_KEY, hostCode.toUpperCase());
  }

  setupError.classList.add("hidden");
  const modeRadio = setupForm.elements["mode"];
  const mode = modeRadio && modeRadio.value === "endless" ? "endless" : "classic";
  startTournament(players, mode, courts, singles, hostCodeHash);
});

scoreboardBtn.addEventListener("click", () => {
  setView("scoreboard");
  render();
});

inviteBtn.addEventListener("click", () => {
  setView("host");
  render();
});

hostContinueBtn.addEventListener("click", () => {
  setView("game");
  render();
});

gateScoreboardBtn.addEventListener("click", () => {
  setView("scoreboard");
  render();
});

historyBtn.addEventListener("click", () => {
  setView("history");
  render();
});

historyBackBtn.addEventListener("click", () => {
  setView("game");
  render();
});

gateForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const code = gateCodeInput.value.trim().toUpperCase();
  if (state && state.codeHash && (await hashJoinCode(code)) === state.codeHash) {
    localStorage.setItem(UNLOCK_KEY, code);
    unlocked = true;
    setView("game");
    gateError.classList.add("hidden");
    render();
  } else {
    gateError.textContent = "Wrong code — ask the host for the 6-character code.";
    gateError.classList.remove("hidden");
  }
});

backBtn.addEventListener("click", () => {
  setView("game");
  render();
});

addRoundBtn.addEventListener("click", () => {
  if (!state || state.mode !== "endless" || state.finished) return;
  const nextRound = state.matches.length ? Math.max(...state.matches.map((m) => m.round)) : 0;
  state.matches.push(...generateRound(state.players.length, nextRound, state.courts || 1, state.singles || 0).matches);
  saveState();
  render();
  if (isBrowser()) {
    publish("round").catch(() => {});
  }
});

finishBtn.addEventListener("click", () => {
  if (!state || state.finished) return;
  state.finished = true;
  saveState();
  render();
  if (isBrowser()) {
    publish("finish").catch(() => {});
  }
});

resetBtn.addEventListener("click", () => {
  if (state !== null && typeof confirm === "function") {
    if (!confirm("A tournament is already in session. End it and start a new one?")) return;
  }
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(UNLOCK_KEY);
  state = null;
  unlocked = false;
  setView("game");
  setupForm.reset();
  render();
  if (isBrowser()) {
    publish("reset").catch(() => {});
  }
});

if (isBrowser() && typeof location !== "undefined") {
  const join = new URLSearchParams(location.search).get("join");
  if (join) localStorage.setItem(UNLOCK_KEY, join.trim().toUpperCase());
}

state = loadState();
applyHash();
render();
refreshGate().then(() => {
  applyHash();
  render();
});
if (isBrowser()) {
  if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
    window.addEventListener("hashchange", () => {
      applyHash();
      render();
    });
  }
  syncShared();
  startPolling();
}
