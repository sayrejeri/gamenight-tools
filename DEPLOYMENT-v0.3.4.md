# Game Night Tools v0.3.4 hotfix deployment

This hotfix fixes the Staff Dashboard reports section on MariaDB/DirectAdmin.

## Included fix

- Removes the failing report-to-user SQL join from the main reports query.
- Loads report rows first, then resolves reporter and reported-profile names separately.
- Keeps reports visible even when a related user record cannot be resolved.
- Keeps the rest of the Staff Dashboard isolated if report-user details fail.

## Important

- There is no database migration for v0.3.4.
- Do not import any SQL file again.
- Do not run `npm install`, `npm run build`, or `next build` on DirectAdmin.
- Keep `.env.production.local` and `node_modules` in place.

## Update steps

1. Stop the Game Night Tools Node.js application in DirectAdmin.
2. Open File Manager at `domains/gamenights.sayrejeri.com/app`.
3. Delete the old `.next` folder only.
4. Upload and extract the v0.3.4 DirectAdmin ZIP into the `app` folder.
5. Allow `.next`, `public`, `package.json`, `server.js`, `VERSION`, and this guide to be replaced.
6. Do not delete `.env.production.local` or `node_modules`.
7. Restart the Game Night Tools Node.js application.
8. Hard refresh with `Ctrl + Shift + R`.

## Test

Open `/dashboard/staff`. The warning should no longer list `reports`, and the Reports section should show either open reports or `No open platform reports.`
