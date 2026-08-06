# Game Night Tools v0.3.6 hotfix deployment

This hotfix fixes profile-request form data loss and mobile dashboard menu behavior.

## Included fixes

- Server and team profile request forms keep every entered value after validation or server errors.
- Switching between Server profile and Team profile no longer loses the fields already entered for either type.
- Required fields are clearly marked.
- Logo and banner URLs are explicitly optional and can be added after approval.
- Validation errors identify the field that needs attention.
- The profile menu and hamburger menu are mutually exclusive.
- Opening one dashboard menu automatically closes the other.
- Selecting any navigation or profile link closes the open menu immediately.
- Tapping the dark mobile backdrop closes the active menu.
- Pressing Escape or clicking outside the desktop profile menu closes it.

## Important

- There is no database migration for v0.3.6.
- Do not import any SQL file.
- Do not run `npm install`, `npm run build`, or `next build` on DirectAdmin.
- Keep `.env.production.local` and `node_modules` in place.

## Update steps

1. Stop the Game Night Tools Node.js application in DirectAdmin.
2. Open File Manager at `domains/gamenights.sayrejeri.com/app`.
3. Delete the old `.next` folder only.
4. Upload and extract the v0.3.6 DirectAdmin ZIP directly into the `app` folder.
5. Allow `.next`, `public`, `package.json`, `server.js`, `VERSION`, and this deployment guide to be replaced.
6. Do not delete `.env.production.local` or `node_modules`.
7. Restart the Game Night Tools Node.js application.
8. Hard refresh the website or close and reopen the mobile browser tab.

## Test checklist

- Begin a server request, leave a required field missing, and confirm the other values remain.
- Enter an invalid optional URL and confirm the form keeps all other values.
- Confirm a server request only requires the server name and Discord server selection.
- Confirm a team request only requires the team name.
- Open the mobile profile menu, then open the hamburger menu and confirm only the hamburger remains open.
- Select a menu link and confirm the menu closes as the new page opens.
- Tap the dark background and confirm the active menu closes.
