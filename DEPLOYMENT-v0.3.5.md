# Game Night Tools v0.3.5 deployment

This hotfix replaces the cramped mobile header with a hamburger menu and fixes the mobile profile menu.

## Included fixes

- Hides the horizontally scrolling desktop navigation on phones.
- Adds a dedicated hamburger menu with Home, Events, Servers, Teams, Suggestions, Tools, and Search.
- Keeps the logo, notifications, profile button, and hamburger control visible in one compact row.
- Converts the profile dropdown into a full-width bottom sheet on mobile.
- Adds the signed-in user's name and site username to the profile sheet.
- Adds a dark blurred backdrop behind open mobile menus.
- Improves touch-target sizes and safe-area spacing for iPhone browsers.

## Important

- There is no database migration for v0.3.5.
- Do not import any previous database migration again.
- Do not run `npm install`, `npm run build`, or `next build` on DirectAdmin.
- Keep `.env.production.local` and `node_modules` in place.

## Update steps

1. Stop the Game Night Tools Node.js application in DirectAdmin.
2. Open File Manager at `domains/gamenights.sayrejeri.com/app`.
3. Delete the old `.next` folder only.
4. Upload and extract the v0.3.5 DirectAdmin ZIP directly into the `app` folder.
5. Allow `.next`, `public`, `package.json`, `server.js`, `VERSION`, and this deployment guide to be replaced.
6. Do not delete `.env.production.local` or `node_modules`.
7. Restart the Game Night Tools Node.js application.
8. On iPhone, close the old tab or clear the website cache, then reopen the site.

## Test checklist

- The mobile header shows no horizontally scrolling navigation links.
- The hamburger opens a centered navigation panel.
- The profile icon opens a bottom sheet that stays within the screen.
- The notification bell still opens Notifications.
- Desktop navigation and profile dropdown remain unchanged.
