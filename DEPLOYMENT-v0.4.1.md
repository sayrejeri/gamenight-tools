# Game Night Tools v0.4.1 deployment

v0.4.1 is an event-hosting QOL release.

## Important

- Build the release only with **Local release verification** on the Windows self-hosted GitHub Actions runner.
- Do **not** run `npm install` or `next build` in DirectAdmin.
- Preserve `.env.production.local` and the existing `node_modules` directory.
- This release requires **database/006_event_hosting_qol.sql exactly once**.
- Migration 006 must be imported after migration 005.
- Do **not** re-import migrations 001, 002, 003, 004, or 005.

## Release package

The verified package should be:

`C:\GameNightToolsRelease\gamenight-tools-v0.4.1-directadmin.zip`

The release workflow must verify these are present before succeeding:

- `.next/BUILD_ID`
- `server.js`
- `package.json`
- `VERSION`
- `database/006_event_hosting_qol.sql`

`VERSION` must contain `0.4.1`.

## Deploy to DirectAdmin

1. Stop the Game Night Tools Node.js application in DirectAdmin.
2. Open `domains/gamenights.sayrejeri.com/app` in File Manager.
3. Upload `gamenight-tools-v0.4.1-directadmin.zip`.
4. Extract it directly into the application directory and overwrite the previous application files when prompted.
5. Do not delete or replace `.env.production.local` or `node_modules`.
6. Confirm a real `.next` directory exists and contains `BUILD_ID`.
7. Confirm `database/006_event_hosting_qol.sql` exists.
8. In phpMyAdmin, select the Game Night Tools database and import `database/006_event_hosting_qol.sql` **one time only**.
9. Start the Node.js application again from DirectAdmin.
10. Hard refresh the website.

## v0.4.1 smoke tests

After restart, verify:

- An event manager can switch between Automatic signup and Host approval.
- Host-approval signups remain pending until staff review them.
- The participant management screen can search and filter participants.
- Private participant notes save and are not shown on the normal event page.
- A full event places additional automatic signups on the waitlist.
- When an approved participant withdraws or is moved out of an approved spot, the earliest waitlisted participant is promoted and notified.
- Co-host permission level and expiration can be edited without removing/re-inviting the co-host.
- Co-host access can be revoked.
- Duplicate event creates a fresh draft and does not copy participants or co-hosts.
- Cancelling an event requires a reason, shows the reason on the event page, and notifies active signup records.
- Existing v0.4 community chat still loads normally.

## Rollback note

The application files can be rolled back to a previous verified package if necessary, but **do not run migration 006 again** and do not casually remove the new database columns. Database rollback should be handled separately and deliberately if ever required.
