# v0.9.0 Test Plan

## Release gate

1. Automated review has no unresolved P1/P2 findings.
2. Local release verification is green on the exact final feature head.
3. Merge only after the feature verification passes.
4. Run Local release verification again on `main` after merge.
5. No database migration is required for v0.9. Do not rerun 001–009.

## Leaderboards

- Open Dashboard → Leaderboards.
- Confirm Players and Teams views both render.
- Confirm all-time player records match known completed Match Center results.
- Confirm championships rank ahead of otherwise stronger non-champions.
- Confirm automatic byes are not counted as wins.
- Confirm forfeits count as decided matches.
- Filter to the current season and verify old matches disappear.
- Filter to a server/workspace and verify results from other servers disappear.
- Filter to a game and verify unrelated games disappear.
- Combine season + server + game filters.
- Confirm approved team tournament results appear in Teams mode.
- Confirm users with private event history do not appear on player leaderboards.

## Competitive profile

- Open a player from the leaderboard.
- Confirm career W/L, win rate, events played, titles, streaks, and rank.
- Confirm current-season record changes independently of all-time record.
- Confirm recent matches show the correct opponent and W/L result.
- Confirm tournament history groups matches by event.
- Confirm game breakdown totals match the career total.
- Confirm a champion gets the Tournament Champion badge.
- Confirm badge thresholds do not award badges early.
- Confirm attendance reliability reflects tracked check-ins/no-shows.
- Confirm PRIVATE profiles remain inaccessible to other users.
- Confirm MEMBERS profiles require login.
- Confirm disabling event-history visibility hides the competitive profile from other users.
- Confirm either direction of an account block hides the competitive profile.

## Team leaderboard

- Complete at least one team tournament match.
- Confirm the two teams receive a win/loss correctly.
- Confirm the tournament champion receives a title after bracket completion.
- Confirm non-approved teams do not surface.
- Confirm team links open the existing approved team profile.

## v0.8 lifecycle regression

- Start an event and publish the bracket LIVE.
- Start a match and verify Series Desk permits normal reporting.
- Postpone or cancel the event while the match/bracket still has LIVE state.
- Attempt a direct series submission as a participant: it must be rejected.
- Reopen the event to draft and repeat: it must be rejected.
- Confirm a normal participant cannot browse Series Desk while the event is not LIVE/COMPLETED.
- Confirm tournament staff can inspect saved series history outside live play.
- Confirm staff inspection still cannot submit a new series while the event is not LIVE.
- Return the event to LIVE and confirm normal reporting works again.

## Regression

- Login, dashboard, events, teams, community, suggestions, tools, and search still load.
- Single elimination, custom three-player, double elimination, round robin, and groups → playoffs still render.
- Match Center ready/start/report/confirm/dispute/override/forfeit/reset flows still work.
- Team tournament roster authority still works.
- Spectator links still preserve private proof/dispute information.
- Game Night Studio, saved pools, Series Desk, and Event Control Room still load.
