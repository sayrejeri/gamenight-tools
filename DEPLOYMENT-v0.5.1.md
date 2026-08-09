# Game Night Tools v0.5.1 deployment

v0.5.1 is a Competitive Events hotfix release.

## Important

- Build the release only with **Local release verification** on the Windows self-hosted GitHub Actions runner.
- Do **not** run `npm install` or `next build` in DirectAdmin.
- Preserve `.env.production.local` and the existing `node_modules` directory.
- **There is no database migration for v0.5.1.**
- Do **not** re-import migrations 001 through 006.

## Release package

The verified package should be:

`C:\GameNightToolsRelease\gamenight-tools-v0.5.1-directadmin.zip`

`VERSION` must contain `0.5.1`.

## Deploy to DirectAdmin

1. Stop the Game Night Tools Node.js application in DirectAdmin.
2. Open `domains/gamenights.sayrejeri.com/app` in File Manager.
3. Upload `gamenight-tools-v0.5.1-directadmin.zip`.
4. Extract it directly into the application directory and overwrite the previous application files when prompted.
5. Do not delete or replace `.env.production.local` or `node_modules`.
6. Confirm a real `.next` directory exists and contains `BUILD_ID`.
7. Do **not** import any SQL migration for this release.
8. Start the Node.js application again from DirectAdmin.
9. Hard refresh the website.

## v0.5.1 smoke tests

After restart, verify:

- Completing a live bracket-enabled event before the bracket has a champion is blocked.
- Completing a live bracket-enabled event after the bracket has a champion succeeds and completes the bracket too.
- Generated bracket previews are available only to the primary host, users with `MANAGE_BRACKETS`, and accepted `FULL` or `BRACKET` co-hosts.
- `VIEW_ONLY`, `SIGNUPS`, `SCOREKEEPER`, and `ANNOUNCEMENTS` co-hosts cannot preview a generated bracket or receive the Manage bracket action unless they separately have `MANAGE_BRACKETS`.
- Live and completed brackets remain viewable to normal event viewers who can access the event.
- Bracket completion validates the saved state while holding the bracket row lock, preventing a concurrent save from racing completion.
- Reopening a completed bracket still returns it to generated status and allows corrections.
- Existing event signup, waitlist, chat, co-host, bracket save, and PNG export workflows still work normally.

## Rollback note

v0.5.1 does not add database columns or tables. Application files can be rolled back to the verified v0.5.0 package if necessary. Do not rerun any database migration during rollback.
