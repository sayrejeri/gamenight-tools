# Game Night Tools v0.9.0 — Competitive Profiles & Leaderboards

v0.9 turns the competitive records already produced by Match Center into visible player history, rankings, seasonal stats, and team competition records.

## Competitive profiles

- Dedicated `/users/<username>/competitive` profile pages.
- Career wins, losses, win rate, championships, events played, current streak, and best win streak.
- Current quarterly season snapshot and seasonal rank.
- Attendance reliability using tracked check-ins and no-shows.
- Game-by-game competitive records.
- Recent opponents and tournament history.
- Automatic competitive badges for titles, streaks, experience, reliability, and perfect tournament runs.
- Existing profile visibility, event-history privacy, and user blocks are honored.

## Leaderboards

- New `Leaderboards` destination in the dashboard navigation.
- Player and approved-team leaderboards.
- All-time and current-season views.
- Server/workspace filtering for servers the signed-in user belongs to.
- Game-specific filtering.
- Rankings prioritize championships, then wins, win rate, fewer losses, and match volume.
- Automatic byes do not count as wins.
- Players who hide competitive/event history are excluded from player leaderboards.

## v0.8 lifecycle hardening

- Series result POSTs now require the event itself to be `LIVE`, not only the bracket.
- Nonstaff participants cannot access Series Desk while an event is cancelled, postponed, draft, or otherwise withdrawn from live play.
- Tournament staff can inspect saved series history outside live play, but the server refuses new series reports until the event returns to `LIVE`.

## Database

- No v0.9 database migration.
- Do not rerun migrations 001–009.
- Expected upgraded database count remains 48 base tables.

## Release artifact

`C:\GameNightToolsRelease\gamenight-tools-v0.9.0-directadmin.zip`
