# Game Night Tools v0.7.0 deployment

## Release summary

v0.7.0 adds expanded tournament formats and team competition support:

- double elimination
- round robin
- groups → playoffs
- team tournament entrants and roster snapshots
- Match Center support for all formats
- anonymous live/completed spectator links
- PNG/viewer support for all competition formats

## Required migration

**Migration 008 is required exactly once.**

Import:

`database/008_expanded_competition_formats.sql`

It must be imported after `database/007_tournament_operations.sql`.

**Do not rerun migrations 001–007.** They are already part of the existing deployed database history.

## Pre-merge verification

Run the GitHub Actions workflow **Local release verification** with ref:

`feature/v0.7.0-expanded-competition-formats`

Do not merge until the exact final branch head is green and automated review has no unresolved release-blocking findings.

The workflow verifies TypeScript, the production build, `.next/BUILD_ID`, DirectAdmin packaging, and inclusion of migration 008.

## Post-merge verification

After PR merge, run **Local release verification** again using:

`main`

Expected package:

`C:\GameNightToolsRelease\gamenight-tools-v0.7.0-directadmin.zip`

## Deployment order

1. Back up the production database.
2. Stop the running Game Night Tools application.
3. Import `database/008_expanded_competition_formats.sql` exactly once.
4. Deploy/extract `C:\GameNightToolsRelease\gamenight-tools-v0.7.0-directadmin.zip` using the normal DirectAdmin application deployment process.
5. Confirm production environment variables remain present, especially `DATABASE_URL`, Discord OAuth settings, webhook encryption settings, and `APP_URL`.
6. Restart the application.
7. Run the smoke tests below.

## Smoke tests

- Existing single-elimination event opens and can run a Match Center result.
- Existing custom three-player event opens normally.
- New double-elimination event generates and shows winners/losers stages.
- New round-robin event generates all pairings and standings.
- New groups-to-playoffs event holds playoff slots until group standings are complete.
- Team event allows an eligible team owner/manager/captain to register a team and stores a roster snapshot.
- Team roster member can operate their side of a live Match Center match.
- Same team cannot self-confirm its own submitted result.
- Host can generate an anonymous spectator link.
- Anonymous spectator link works for LIVE/COMPLETED state and does not expose proof/dispute/staff data.
- PNG export works for the new formats.
- Event completion remains blocked until the competition has a champion.

## Rollback note

The v0.7 application expects migration 008 columns/tables. If application files must be rolled back after migration 008 is applied, restore the pre-deployment database backup together with the previous application build rather than manually dropping individual v0.7 columns or tables in production.
