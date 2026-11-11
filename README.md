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

Open `index.html` in a browser, or serve the folder:

```
python3 -m http.server 8000
```

then visit `http://localhost:8000`.

Progress is saved in `localStorage`, so a refresh keeps the tournament.

## Files

- `index.html` — page structure
- `styles.css` — padel-court styling
- `app.js` — UI controller (setup, score entry, standings)
- `logic.js` — pure tournament logic (schedule, validation, standings), shared by browser and tests
- `test/logic.test.js` — unit tests for the logic module
- `test/ui.smoke.test.js` — end-to-end UI flow test with a minimal fake DOM

## Tests

```
node test/logic.test.js
node test/ui.smoke.test.js
```
