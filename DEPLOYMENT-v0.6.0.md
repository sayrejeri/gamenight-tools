# Game Night Tools v0.6.0 deployment

## Release artifact

Local release verification should create:

`C:\GameNightToolsRelease\gamenight-tools-v0.6.0-directadmin.zip`

## Database migration — required

v0.6.0 adds tournament-operation persistence. Import this migration **exactly once** after migration 006:

`database/007_tournament_operations.sql`

Do not rerun migrations 001–006.

Before importing 007, take a database backup.

## Recommended deployment order

1. Take a database backup.
2. Stop the DirectAdmin Node application.
3. Import `database/007_tournament_operations.sql` exactly once.
4. Extract `gamenight-tools-v0.6.0-directadmin.zip` over the application files.
5. Preserve the production environment file and the existing `node_modules` deployment setup.
6. Start the DirectAdmin Node application.
7. Hard refresh the website.

## Smoke tests

### Existing competitive flow
- Open an existing v0.5 bracket and confirm its players/matches still load.
- Save a bracket more than once and confirm normalized match IDs remain stable.
- Test single elimination, automatic byes, and winner advancement.
- Test the custom three-player no-rematch flow.

### Match Center
- Open `/dashboard/events/<eventId>/matches` from a bracket-enabled event.
- Confirm non-managers cannot preview a Generated bracket before it is Live.
- Confirm tournament managers can preview Match Center while preparing the bracket.
- Test both players marking ready and starting a match.
- Schedule a match, change best-of, and confirm the no-show deadline is displayed.
- Pause the tournament and verify participant actions are blocked until resumed.

### Results and disputes
- Submit a result as one participant.
- Confirm the opponent can confirm it and that the bracket automatically advances.
- Submit another result and open a dispute from the opponent account.
- Resolve the dispute as tournament staff.
- Test a staff override with a required reason.
- Test a forfeit/no-show decision with a required reason.
- Reopen a completed result and confirm dependent downstream winner selections are cleared safely.

### History and communication
- Confirm event standings update after completed matches.
- Confirm personal wins/losses, streak, championships, and event head-to-head records render.
- Confirm website match notifications are created.
- If a workspace webhook subscribes to bracket updates, confirm important match updates are posted.
- Confirm match operations appear in the audit log.

## Rollback note

If the application needs to be rolled back after migration 007 has been imported, restore the pre-v0.6 database backup together with the previous application package. Do not attempt to re-import migration 007 a second time.
