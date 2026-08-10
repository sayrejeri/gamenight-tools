# Deploy Game Night Tools v0.9.0

## Before deployment

- Confirm PR review has no unresolved release-blocking findings.
- Run **Local release verification** on the exact final `feature/v0.9.0-competitive-profiles-leaderboards` head.
- Merge only after that run is green.
- Run **Local release verification** again on `main` after merge.
- Use the ZIP created by the final green `main` verification:
  `C:\GameNightToolsRelease\gamenight-tools-v0.9.0-directadmin.zip`

## Database

v0.9.0 has **no database migration**.

- Do not rerun migrations 001–009.
- If v0.8 migration 009 was already applied, the expected database count remains **48 base tables**.

## DirectAdmin upload

1. Back up the database and current application directory.
2. Open DirectAdmin → File Manager and enter the existing Game Night Tools application directory.
3. Upload `gamenight-tools-v0.9.0-directadmin.zip`.
4. Extract the ZIP into the existing application directory and overwrite the old deployment files.
5. Keep the existing production environment configuration and secrets.
6. Open the Node.js application controls in DirectAdmin and restart the application.
7. Load the site in a fresh browser session.

## Immediate smoke checks

- Login and dashboard load.
- `Leaderboards` appears in dashboard navigation.
- Player leaderboard loads without a server error.
- Team leaderboard loads without a server error.
- Open one player competitive profile from the leaderboard.
- Apply current-season, server, and game filters.
- Open a v0.8 Series Desk and verify the event-lifecycle guard: new series reports must fail whenever the event itself is not LIVE.

## Rollback

If a release-blocking issue appears after deployment, restore the previous application files and restart the Node.js application. No database rollback is required for v0.9 because this release does not change the schema.
