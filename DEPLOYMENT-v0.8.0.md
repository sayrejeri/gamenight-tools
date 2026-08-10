# Game Night Tools v0.8.0 — DirectAdmin deployment

## Release

Expected verified ZIP:

`C:\GameNightToolsRelease\gamenight-tools-v0.8.0-directadmin.zip`

## Database migration

v0.8.0 requires one new migration:

`database/009_game_night_tools_series.sql`

Import **009 exactly once after 008**.

Do **not** rerun migrations 001–008.

Migration 009 adds:

- `game_night_pools`
- `game_night_pool_items`

After a clean upgrade from v0.7.x, the database should have **48 base tables**.

The structured tournament series feature reuses the existing `match_reports.game_results_json` column from migration 007, so no additional match-report table is required.

## Deployment order

1. Back up the current website files and database.
2. Confirm migrations 001–008 were already applied from prior releases.
3. Import `database/009_game_night_tools_series.sql` exactly once.
4. Upload and extract `gamenight-tools-v0.8.0-directadmin.zip` over the application files.
5. Keep the production `.env` / environment variables unchanged.
6. Restart the Node.js application in DirectAdmin.
7. Confirm the site reports v0.8.0 and normal Discord login still works.
8. Run the smoke checks below.

## v0.8 smoke checks

### Saved pools

- Open Tools → Saved game & map pools.
- Create a map pool with at least three entries.
- Edit the pool and confirm the changes persist after refresh.
- Pick through every item and confirm no item repeats until the cycle resets.
- Delete a test pool.

### Game Night Studio

- Change both scoreboard names.
- Add/subtract scores, swap sides, set a target score, and reset.
- Toggle scoreboard presentation mode and exit it again.
- Start/pause/resume/reset both countdown and stopwatch modes.
- Test player no-repeat picking and random team generation.
- Pick from a saved game/map pool.

### Series Desk

Use a LIVE tournament match with Best of 3 or Best of 5.

- Open the competition page and enter Series Desk.
- Report enough game rows for one side to clinch.
- Include map names and optional per-game scores.
- Confirm the report becomes `AWAITING_CONFIRMATION` in Match Center.
- Confirm from the opposing entrant/account.
- Verify the bracket advances exactly once and the overall series score is correct.
- Reopen/reset a test result and confirm the normal correction flow still works.

### Event Control Room

- As the primary host, BRACKET/FULL cohost, SCOREKEEPER cohost, or workspace bracket manager, open Control Room from the event competition page.
- Verify live/awaiting/disputed/completed counts match Match Center.
- Verify the embedded scoreboard, timer, and saved-pool picker work.
- Confirm ordinary spectators cannot access the staff Control Room.

## Rollback

If the application must be rolled back, restore the previous website package and database backup together. Do not attempt to remove migration 009 tables manually while v0.8 code has written saved pool data.
