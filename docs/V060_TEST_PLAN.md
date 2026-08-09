# v0.6.0 Tournament Operations test plan

This release is not ready to merge until all release gates pass.

## Build gate

Run **Local release verification** against `feature/v0.6.0-tournament-operations` and require a green TypeScript check, production build, and DirectAdmin package verification.

## Database gate

Use a database backup or staging copy and import `database/007_tournament_operations.sql` exactly once after migration 006. Verify existing brackets retain their entries and match history after the first save on v0.6.

## Functional gate

- Single-elimination bracket save preserves normalized match IDs.
- Three-player bracket save preserves normalized match IDs.
- Ready checks work only for linked match participants.
- Both players ready allows the match to start.
- Tournament managers can schedule matches and choose best-of values.
- Tournament pause blocks participant match actions and resume restores them.
- Player result reports require a valid winner and internally consistent score.
- A reporting player cannot confirm their own result.
- Opponent confirmation advances the visual and normalized bracket together.
- Opponent dispute stops advancement and records the reason/evidence URL.
- Staff can confirm a disputed report or override it with a required reason.
- Staff forfeit/no-show decisions advance the bracket and are audited.
- Reopening a result clears dependent downstream selections that are no longer valid.
- Event standings exclude automatic byes.
- Personal W/L, streak, championship count, and head-to-head render without exposing private event details.
- Match notifications link back to Match Center.
- Discord tournament webhooks only fire for configured destinations.

## Regression gate

- Existing event signup, check-in, waitlist, co-host, bracket viewer, bracket manager, PNG export, and v0.5 completion guards still work.
- A completed event still requires a completed bracket path with an actual champion.
