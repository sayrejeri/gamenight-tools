# v0.8.0 release test plan

## 1. Database / migration 009

- Apply migrations 001–008 to a representative database, then apply 009 once.
- Confirm `game_night_pools` and `game_night_pool_items` exist with the expected foreign keys.
- Confirm a clean upgraded database has 48 base tables.
- Confirm 009 is included in the release ZIP.

## 2. Saved pools

- Create GAME, MAP, and MIXED pools.
- Reject empty pool names and empty item lists.
- Duplicate item labels are normalized to one item in a saved pool.
- Duplicate pool names for the same user return a friendly conflict.
- Users can only read/update/delete their own pools.
- Editing a pool replaces the item set atomically.
- Deleting a pool cascades its items.
- No-repeat picker completes a full cycle before resetting.

## 3. Game Night Studio

- Scoreboard add/subtract never drops below zero.
- Swap sides swaps both names and scores.
- Target score winner state clears correctly after reset/change.
- Presentation mode can be entered and exited.
- Countdown presets, custom duration, start, pause, resume, and reset work.
- Stopwatch start, pause, resume, and reset work.
- Player picker does not repeat before a full cycle.
- Team generator distributes all entered players without duplicates or drops.
- Saved pool picker handles empty pools and full-cycle reset cleanly.

## 4. Structured series reporting

Test Best of 1, 3, 5, 7, and 9 where practical.

- Only a linked player or snapshotted team member can submit a normal series report.
- A user on both sides is blocked.
- Tournament managers who are not entrants cannot impersonate a normal player report.
- Bracket must be LIVE and the selected match must be LIVE.
- Paused tournaments reject series reports.
- Games must be numbered consecutively starting at 1.
- Reported games cannot exceed the match best-of.
- Every per-game winner must be one of the two match entrants.
- Optional per-game scores must be both present or both omitted, cannot tie, and must agree with the selected winner.
- One side must reach the required wins to clinch.
- Extra games after the clinch are rejected.
- Submitted series score equals the game-win totals.
- A second pending/disputed report cannot be created for the same match.
- Opponent confirmation uses normal Match Center confirmation and advances the bracket once.
- Dispute, override, forfeit, and reset behavior continue to work with series-generated reports.
- Team tournaments notify the opposing snapshotted roster, not current unrelated team members.

## 5. Series Desk UI

- Only the current entrant's live matches are actionable for a normal user.
- Staff can inspect the series desk without receiving normal player-report controls when they are not an entrant.
- Saved pools can populate randomized opening maps.
- Adding/removing game rows keeps numbering sequential.
- Submit button stays disabled until the series is clinched and every shown map/game label is filled.
- Existing structured reports render map-by-map after refresh.

## 6. Event Control Room

- Primary host, workspace `MANAGE_BRACKETS`, FULL/BRACKET cohost, and SCOREKEEPER cohost can open the Control Room.
- Users without tournament-manager access receive the normal not-found boundary.
- Match counts match the normalized Match Center rows.
- Disputed and awaiting-confirmation matches sort ahead of live/ready matches.
- Embedded scoreboard, timer, and pool picker operate independently of official tournament state.

## 7. Regression

- Single elimination, double elimination, round robin, groups → playoffs, and three-player competitions still render.
- Normal Match Center score-only reporting still works.
- Team tournament ready/confirm/dispute flows still work.
- Spectator links remain read-only and do not expose Control Room or private result evidence.
- PNG bracket exports still work.
