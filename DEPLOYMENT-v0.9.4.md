# Deploy Game Night Tools v0.9.4

## Database

**No database migration is included in v0.9.4.**

- Do not import or rerun migrations `001`–`009`.
- Production remains at **48 base tables**.

## Before merge

1. Confirm the v0.9.4 PR exact head is the commit that passed release checks.
2. Require TypeScript, production build, and competition regression smoke to be green on that exact head.
3. Run **Local release verification** on branch `feature/v0.9.4-bracket-event-polish`.
4. Complete the focused v0.9.4 bracket/event test plan.
5. Resolve any genuine release-blocking P1/P2 findings before merging.

## Merge and verify main

After the v0.9.4 PR is merged:

1. Run **Local release verification** again on `main`.
2. Confirm `VERSION` is `0.9.4`.
3. Confirm the generated artifact is:

`C:\GameNightToolsRelease\gamenight-tools-v0.9.4-directadmin.zip`

Do not deploy a branch artifact in place of the post-merge `main` artifact.

## DirectAdmin deployment

1. Back up the currently deployed application files using the normal procedure.
2. Upload `gamenight-tools-v0.9.4-directadmin.zip`.
3. Extract it over the application directory, replacing the previous application files.
4. Restart the Node application.
5. Do **not** import any SQL file.

## Post-deploy smoke checks

Verify:

- a decided real match shows Winner on the winner and Loser on the opponent
- automatic BYE match cards are hidden while advancement still works
- uneven entrant counts still produce correct brackets
- read-only and management bracket views agree
- bracket PNG export works and omits automatic BYE cards
- Events defaults to Active and Past / Archived / All filters work
- changing the archive age only changes dashboard organization and does not delete or alter events
- completed/cancelled history, stats, brackets, spectator links, and event access remain intact
- v0.9.3 rich descriptions and calendar title/start-only export still work

## Rollback

If a release-blocking regression is found, restore the previous application files and restart the Node application. No database rollback is necessary because v0.9.4 has no schema/data migration.
