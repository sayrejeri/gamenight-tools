# v0.8.0 — Game Night Tools & Series

v0.8 expands the site beyond tournament structure and match administration into the live tools hosts use during an actual game night.

## Game Night Studio

- Live two-side scoreboard with score controls, side swapping, target score, reset, and presentation mode.
- Countdown timer and stopwatch with quick presets, pause/resume, and reset.
- Player picker with no-repeat cycles.
- Random team generator.
- Quick picker for saved game/map pools.

## Saved game & map pools

- Save reusable GAME, MAP, or MIXED pools.
- Optional details on each pool item.
- Edit/delete saved pools.
- Pick without repeats until every item has been used, then start a new cycle.

## Tournament series reporting

- Dedicated Series Desk for structured best-of reporting.
- Record each game/map, optional mode, winner, and optional per-game score.
- Best-of validation prevents extra games after a series is clinched.
- Series score is calculated from the game-by-game winners.
- Saved pools can randomize opening maps for a series.
- Submitted series results enter the existing opponent-confirmation/dispute workflow and only advance the bracket after confirmation or staff resolution.

## Event Control Room

- Staff-only live event dashboard.
- Current competition status and match attention counts.
- Live/awaiting/disputed/current match queue.
- Embedded scoreboard, timer, and saved-pool picker.
- Quick links to Match Center, Series Desk, and competition view.

## Database

- Adds migration `database/009_game_night_tools_series.sql`.
- Adds `game_night_pools` and `game_night_pool_items`.
- Import migration 009 exactly once after 008.
