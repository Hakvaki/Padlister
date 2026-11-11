# Padel Americano — 4 Players

A zero-dependency web app for a classic 4-player Americano padel tournament.

## Format

With four players there are exactly three possible pairings, so the tournament
is three rounds of 2v2:

| Round | Team 1 | Team 2 |
|-------|--------|--------|
| 1 | P1 + P2 | P3 + P4 |
| 2 | P1 + P3 | P2 + P4 |
| 3 | P1 + P4 | P2 + P3 |

Everyone partners with everyone else exactly once. Points are the games your
team wins in each match, accumulated across all three rounds. Standings are
ordered by points, then matches won, then game difference.

## Run it

### Shared play session (recommended)

Start the zero-dependency Node server:

```
node server.js
```

then open `http://localhost:8000` in Chrome. Others on the same network can
open `http://<your-computer-ip>:8000` (e.g. `http://192.168.1.20:8000`) and
join the same tournament — everyone can enter player names and scores, and all
devices stay in sync (the page polls the server every 2 seconds). Set `HOST`
and `PORT` to change the bind address, e.g. `PORT=3000 node server.js`.

Tournament state is persisted on the server in `data/tournament.json`, so
restarting the server keeps the session. Each browser also keeps a
`localStorage` copy as an offline fallback when the server is unreachable.

### Single browser, no server

Open `index.html` directly in a browser, or serve the folder:

```
python3 -m http.server 8000
```

then visit `http://localhost:8000`. Progress is saved in `localStorage`, so a
refresh keeps the tournament.

## Files

- `index.html` — page structure
- `styles.css` — padel-court styling
- `app.js` — UI controller (setup, score entry, standings)
- `logic.js` — pure tournament logic (schedule, validation, standings), shared by browser and tests
- `server.js` — zero-dependency Node server: serves the page and a small REST API (`/api/state`, `/api/tournament`, `/api/matches/:id/score`, `/api/reset`) with JSON file persistence, so multiple browsers share one live tournament
- `test/logic.test.js` — unit tests for the logic module
- `test/ui.smoke.test.js` — end-to-end UI flow test with a minimal fake DOM
- `test/server.test.js` — API tests for the server (spins it up on an ephemeral loopback port)

## Tests

```
node test/logic.test.js
node test/ui.smoke.test.js
node test/server.test.js
```
