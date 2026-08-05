# Game Night Tools v0.3.1 hotfix deployment

This hotfix fixes the platform search crash and several layout problems reported after the v0.3.0 launch.

## Included fixes

- Search no longer fails when one result category has a database/query problem.
- User, server, team, event, and suggestion searches run independently.
- Exact site usernames are ranked first in user search results.
- Tools use independent columns so shorter cards move upward instead of leaving large blank gaps.
- The Discord time tool explains local conversion, shows the detected timezone, and provides separate full-time and countdown codes.
- Site username and main gaming platform fields align correctly.
- Game identity icons use a fixed icon column so platform/account artwork and labels line up consistently.

## Important

- There is no database migration for v0.3.1.
- Do not import `database/003_community_foundation.sql` again.
- Do not run `npm install`, `npm run build`, or `next build` on DirectAdmin.
- Keep `.env.production.local` and `node_modules` in place.

## Update steps

1. Stop the Game Night Tools Node.js application in DirectAdmin.
2. Open File Manager at `domains/gamenights.sayrejeri.com/app`.
3. Delete the old `.next` folder only.
4. Upload and extract the v0.3.1 DirectAdmin ZIP directly into the `app` folder.
5. Allow `.next`, `public`, `package.json`, `server.js`, `VERSION`, and this guide to be replaced.
6. Do not delete `.env.production.local` or `node_modules`.
7. Restart the Game Night Tools Node.js application.
8. Hard refresh with `Ctrl + Shift + R`.

## Test checklist

- Search your site username and confirm your user profile appears.
- Open Tools and confirm the cards no longer leave large row gaps.
- Select a date/time and copy the Discord full time plus countdown.
- Open Profile Settings and confirm the first two inputs align.
- Open Game Identities and confirm every icon and heading begins on the same line.
