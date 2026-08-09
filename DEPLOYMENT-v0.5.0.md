# Game Night Tools v0.5.0 deployment

v0.5.0 is the Competitive Events release.

## Important

- Build the release only with **Local release verification** on the Windows self-hosted GitHub Actions runner.
- Do **not** run `npm install` or `next build` in DirectAdmin.
- Preserve `.env.production.local` and the existing `node_modules` directory.
- **There is no new database migration for v0.5.0.** The competitive release activates the bracket tables that already exist from the initial schema.
- Do **not** re-import migrations 001 through 006.

## Release package

The verified package should be:

`C:\GameNightToolsRelease\gamenight-tools-v0.5.0-directadmin.zip`

`VERSION` must contain `0.5.0`.

## Deploy to DirectAdmin

1. Stop the Game Night Tools Node.js application in DirectAdmin.
2. Open `domains/gamenights.sayrejeri.com/app` in File Manager.
3. Upload `gamenight-tools-v0.5.0-directadmin.zip`.
4. Extract it directly into the application directory and overwrite the previous application files when prompted.
5. Do not delete or replace `.env.production.local` or `node_modules`.
6. Confirm a real `.next` directory exists and contains `BUILD_ID`.
7. Do **not** import any SQL migration for this release.
8. Start the Node.js application again from DirectAdmin.
9. Hard refresh the website.

## v0.5.0 smoke tests

After restart, verify:

- A bracket-enabled event imports approved participants into the bracket manager.
- Linked participants retain stable `user-<id>` identities when a new event bracket is generated.
- Random and manual placement both generate valid single-elimination brackets.
- Byes advance automatically.
- Selecting winners advances players through later rounds.
- The three-player format follows A vs B, C vs the Match 1 loser, then C vs the Match 1 winner with no rematch.
- Saving an event bracket writes the visual state and normalized bracket entries/matches.
- A saved generated bracket can be published live.
- Event viewers can open a live bracket from the event page.
- Saving additional results while live keeps the bracket live.
- A bracket cannot be marked completed until a champion/advancing player is determined.
- A completed bracket is locked for edits until a manager reopens it.
- Reopening a completed bracket allows corrections and returns it to generated status.
- PNG export still works for both single-elimination and three-player formats.
- Existing event signup, waitlist, chat, and co-host workflows still work normally.

## Rollback note

v0.5.0 does not add database columns or tables. Application files can be rolled back to the previous verified package if necessary. Existing bracket rows may remain in `bracket_entries` and `bracket_matches`; older application versions will simply continue relying on the saved bracket JSON.
