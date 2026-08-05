# Game Night Tools v0.2.1 deployment

This is a code-only bracket hotfix. There are no database changes.

## DirectAdmin steps

1. Stop the Game Night Tools Node.js app.
2. Open `domains/gamenights.sayrejeri.com/app` in File Manager.
3. Delete only the existing `.next` folder.
4. Upload and extract the v0.2.1 DirectAdmin ZIP directly into the `app` folder.
5. Allow `package.json`, `server.js`, and `VERSION` to be replaced.
6. Leave `.env.production.local` and `node_modules` untouched.
7. Restart the Node.js app.
8. Hard-refresh the website with `Ctrl + F5`.
9. Open the bracket tool and generate a new bracket. Old saved bracket drafts should be regenerated so they use the corrected bye placement.

Do not run `npm install`, `next build`, or any other build command on the shared server.
