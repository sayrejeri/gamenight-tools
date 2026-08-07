# Game Night Tools v0.3.7 deployment

This release focuses on event participation, co-host invites, Discord refresh, logout reliability, and public onboarding/legal pages.

## Included changes

- Co-host invites accept a site username, Discord username, or numeric Discord ID.
- Existing Game Night Tools users appear as co-host suggestions while typing.
- Existing users receive a site notification when invited as a co-host.
- Numeric Discord IDs still create pending co-host invitations for people who have not signed in yet.
- Event staff, hosts, and co-hosts can manage an event and still sign up as participants.
- Missing required game identities show direct Link account and Refresh from Discord actions.
- Discord refresh returns the user to the event or profile page they came from.
- Game identities includes a dedicated Refresh from Discord control.
- Logout now redirects using the configured public APP_URL instead of an internal proxy address.
- Added public Help & Walkthrough, Terms of Service, and Privacy pages.
- Added Terms, Privacy, and Help links to the landing page and Help to the account menu.
- Added a plain-language sign-in notice linking Terms and Privacy.

## Database

There is no database migration for v0.3.7.

## DirectAdmin update

1. Stop the Game Night Tools Node.js application.
2. Open `domains/gamenights.sayrejeri.com/app`.
3. Delete the existing `.next` folder only.
4. Upload and extract `gamenight-tools-v0.3.7-directadmin.zip` directly into the app folder.
5. Allow `.next`, `public`, `package.json`, `server.js`, `VERSION`, and `DEPLOYMENT-v0.3.7.md` to be replaced.
6. Keep `.env.production.local` and `node_modules` untouched.
7. Restart the Node.js application.
8. Hard refresh desktop browsers and close/reopen mobile tabs if an older UI is cached.

Do not run npm install or a Next.js build on DirectAdmin.

## Test checklist

- Search an existing site user while inviting a co-host and confirm suggestions appear.
- Invite by site username and confirm the invitation appears for that user.
- Invite a not-yet-registered person using a numeric Discord ID.
- Confirm authorized event staff can see and use the participant signup controls.
- Open an event requiring a game identity while missing that identity and test both Link account and Refresh from Discord.
- Refresh Discord connections and confirm the site returns to the original page.
- Sign out and confirm the browser returns to the public Game Night Tools homepage, not an internal address.
- Open `/help`, `/terms`, and `/privacy` while signed out.
