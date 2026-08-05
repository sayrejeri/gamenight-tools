# Game Night Tools v0.3.2 deployment

This update improves profile artwork, platform moderation, server-profile administration, owner assignment, and server-game presentation.

## Included changes

- Game identity cards use consistent icon sizing.
- Xbox and other recognized platforms use reliable platform-logo artwork with a text fallback if an image fails.
- Public profiles show a clear Report profile button and a separate Block user button.
- Profile reports link directly to the reported account in the staff dashboard.
- Platform moderators can clear a profile bio/banner, force a profile private, suspend an account, ban an account, or restore it.
- Suspended and banned accounts can no longer use an existing website session.
- The staff dashboard includes a searchable website-user directory.
- Platform owners and admins have a searchable server-profile directory.
- Platform owners and admins can open and modify approved server profiles such as Villagism.
- Server owners can be assigned by numeric Discord ID before their first website login.
- Existing website users can be assigned Owner, Admin, Staff, Host, Referee, or Viewer access.
- Owner Discord-ID claims stay synchronized when roles are changed or removed.
- Server-game artwork stretches across the full width of each saved-game card.

## Important

- There is no database migration for v0.3.2.
- Do not import any SQL file again.
- Do not run `npm install`, `npm run build`, or `next build` on DirectAdmin.
- Keep `.env.production.local` and `node_modules` in place.

## Update steps

1. Stop the Game Night Tools Node.js application in DirectAdmin.
2. Open File Manager at `domains/gamenights.sayrejeri.com/app`.
3. Delete the old `.next` folder only.
4. Upload and extract the v0.3.2 DirectAdmin ZIP into the `app` folder.
5. Allow `.next`, `public`, `package.json`, `server.js`, `VERSION`, and this guide to be replaced.
6. Do not delete `.env.production.local` or `node_modules`.
7. Restart the Game Night Tools Node.js application.
8. Hard refresh the website with `Ctrl + Shift + R`.

## Test checklist

- Open a public profile and confirm all identity icons are consistently sized.
- Confirm Xbox shows a logo or the built-in XB fallback instead of a broken image.
- Open another user's profile and confirm Report profile and Block user are visible.
- Open Staff Dashboard and then Website users.
- Search a site username or Discord ID.
- Open Server profiles and select Villagism.
- Confirm the server profile can be edited by a platform owner or admin.
- Add an owner using a numeric Discord ID.
- Confirm server-game artwork fills the width of its card.
