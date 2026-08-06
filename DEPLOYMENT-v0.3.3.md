# Game Night Tools v0.3.3 deployment

This hotfix cleans up the dashboard and workspace layouts, fixes profile platform artwork, improves notifications, and makes the private Staff Dashboard resilient when one data section has a query problem.

## Included fixes

- Server access management is clearly marked private.
- Only server owners/admins and platform owners/admins can view server ownership and staff controls.
- Platform overrides display separately from the user's actual server role.
- Server role inputs and the Add access button align correctly.
- Saved server games use the same compact side-image layout as event cards.
- Workspace cards are wider, shorter, and no longer cut off names or logos.
- The Enter a code panel no longer stretches to match a taller workspace panel.
- Workspace, registered-server, and available-event sections show counts and scroll internally when they become long.
- Server profile badges now explain what each badge means.
- Platform icon fallback letters no longer show through transparent logos.
- Xbox uses a bundled local icon instead of an unreliable external image.
- Access notifications include the server name, including older server-role notifications when the server can be resolved.
- The Staff Dashboard loads each section independently so one failed query does not crash the entire page.

## Important

- There is no database migration for v0.3.3.
- Do not import any previous SQL migration again.
- Do not run `npm install`, `npm run build`, or `next build` on DirectAdmin.
- Keep `.env.production.local` and `node_modules` in place.

## Update steps

1. Stop the Game Night Tools Node.js application in DirectAdmin.
2. Open File Manager at `domains/gamenights.sayrejeri.com/app`.
3. Delete the old `.next` folder only.
4. Upload and extract the v0.3.3 DirectAdmin ZIP into the `app` folder.
5. Allow `.next`, `public`, `package.json`, `server.js`, `VERSION`, and this guide to be replaced.
6. Do not delete `.env.production.local` or `node_modules`.
7. Restart the Game Night Tools Node.js application.
8. Hard refresh with `Ctrl + Shift + R`.

## Test checklist

- Open Villagism and confirm server games match the compact event-card layout.
- Confirm the private server-access section explains who can view it.
- Confirm the User/Discord ID, role selector, and Add access button align.
- Open your public profile and confirm no fallback letters show through logos.
- Confirm Xbox shows a proper icon.
- Open the main dashboard and confirm workspace cards are wider and shorter.
- Add or change a test server role and confirm the notification names the server.
- Open the Staff Dashboard and confirm it loads even if one section reports a warning.
