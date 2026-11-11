# Padel Americano — 4 Players

A zero-dependency web app for a classic 4-player Americano padel tournament.

## Format

With four players there are exactly three possible pairings:

| Round | Team 1 | Team 2 |
|-------|--------|--------|
| 1 | P1 + P2 | P3 + P4 |
| 2 | P1 + P3 | P2 + P4 |
| 3 | P1 + P4 | P2 + P3 |

Two modes are available at setup:

- **Classic** — the three rounds above, everyone partners everyone exactly
  once. The tournament is complete when all three matches have scores.
- **Endless** — rounds keep cycling through the same three pairings; tap
  "Add round" after each match and "End game" when you're done. The current
  score is always visible.

Points are the games your team wins in each match, accumulated across all
played rounds. Standings are ordered by points, then matches won, then game
difference. During a tournament, the **Scoreboard** button switches to a
large live view (standings + played match scores) that stays in sync on every
device; "Back to controls" returns to score entry.

## Join code (light access control)

When a tournament starts, the host sees an invite screen with a random
6-character code and a QR code linking to the page with that code embedded
(`...?join=CODE`). Players scan the QR code or type the code to unlock score
editing on their device; the live scoreboard stays viewable without the code.
Only a SHA-256 hash of the code is stored in the shared state — never the code
itself. Note this is client-side gating for casual play: the Firebase rules
are still open, so it keeps honest players out of the controls, not attackers.

## Host-only controls

Set `window.PADEL_HOST_CODE_HASH` in `config.js` to the SHA-256 hex of a secret
host code (compute it with
`node -e "console.log(require('crypto').createHash('sha256').update('YOUR-CODE').digest('hex'))"`).
Then only the device that knows the host code can **start a tournament** (the
setup form asks for it) or press **New tournament** — the button is hidden for
everyone else. When a tournament is already in session, pressing it asks for
confirmation ("End it and start a new one?") before anything is cleared. The
local `server.js` enforces the same check when `PADEL_HOST_CODE_HASH` is set in
its environment. Leave the config empty to disable the host check.

## Navigating between views

Views are also reachable by URL hash, so they can be shared or bookmarked:
`#/invite` shows the host's QR code screen again (host only — the "Invite
(QR)" button in the toolbar does the same), `#/scoreboard` opens the live
scoreboard directly, `#/game` returns to score entry.

## Run it

### Always-on page via GitHub Pages (like the countdown repo)

Enable GitHub Pages for this repository (Settings → Pages → "Deploy from a
branch" → `main` → `/ (root)`). The app is then constantly running at:

```
https://hakvaki.github.io/Padlister/
```

Note: on the free plan GitHub Pages only serves **public** repositories, so
make this repo public first (same as the `countdown` repo).

### Sharing scores from the static page (iPhone-friendly, no server)

The page can sync a live shared tournament through a free **Firebase Realtime
Database**, using only its REST API — no SDK, no build step:

1. Create a free project at [console.firebase.google.com](https://console.firebase.google.com),
   add a **Realtime Database** (any region), and set its rules to
   `{"rules": {".read": true, ".write": true}}` (fine for a throwaway game;
   the database URL is not a secret, the rules are the access control).
2. In Project settings → Your apps, copy the `databaseURL`
   (e.g. `https://<project>-default-rtdb.europe-west1.firebasedatabase.app`).
3. Put it in `config.js` as `window.PADEL_DB_URL = "..."` and commit — you can
   edit the file right on GitHub from your iPhone. Leave it empty to play
   per-device only.
4. Open the Pages URL on every phone. Everyone can enter the four names and
   scores; all devices poll the database every 2 seconds and stay in sync.
   Without a database URL, the page silently falls back to per-device
   `localStorage` (and to the local `api/*` endpoints when served by
   `server.js`).

### Shared play session (multiple devices, one live tournament)

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
`localStorage` copy as an offline fallback when the server is unreachable. On
the static GitHub Pages build there is no backend, so every device plays its
own local tournament — use the Node server when several people must share one
live scoreboard.

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
- `config.js` — optional `window.PADEL_DB_URL` pointing at a Firebase Realtime Database URL for live shared scoring on the static page
- Join codes / QR invite are generated in `logic.js` (`generateJoinCode`, `hashJoinCode`); the QR image itself is rendered via a public QR image API, with the typed code as fallback
- `server.js` — zero-dependency Node server: serves the page and a small REST API (`/api/state`, `/api/tournament`, `/api/matches/:id/score`, `/api/round`, `/api/finish`, `/api/reset`) with JSON file persistence, so multiple browsers share one live tournament
- `test/logic.test.js` — unit tests for the logic module
- `test/ui.smoke.test.js` — end-to-end UI flow test with a minimal fake DOM
- `test/server.test.js` — API tests for the server (spins it up on an ephemeral loopback port)
- `test/share.test.js` — shared-sync test against a mock Firebase-style REST database on loopback

## Tests

```
node test/logic.test.js
node test/ui.smoke.test.js
node test/server.test.js
node test/share.test.js
```
