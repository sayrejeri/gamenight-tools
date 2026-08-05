# Game Night Tools v0.3.0 deployment

This release adds the community foundation: site user profiles, onboarding and privacy, server/team profile requests, staff approvals, teams and recruitment, suggestions and voting, search, notifications, moderation foundations, the tools hub, server banners, and encrypted Discord webhooks.

## Important

- Import `database/003_community_foundation.sql` exactly once before starting v0.3.0.
- Do not import `001_initial.sql` or `002_expanded_events.sql` again.
- Do not run `npm install`, `npm run build`, or `next build` on DirectAdmin.
- Keep `.env.production.local` private and in place.
- The deployment ZIP does not contain any secrets.

## Update steps

1. Stop the Game Night Tools Node.js application in DirectAdmin.
2. Open phpMyAdmin and select the existing `sayrejeri_gamenights` database.
3. Import `database/003_community_foundation.sql` and confirm the success message.
4. Open File Manager at `domains/gamenights.sayrejeri.com/app`.
5. Delete the old `.next` folder only.
6. Upload and extract the v0.3.0 DirectAdmin ZIP directly into the `app` folder.
7. Allow `package.json`, `server.js`, `VERSION`, `public`, and `.next` to be replaced.
8. Do not delete `.env.production.local` or `node_modules`.
9. Confirm `.env.production.local` still has private `600` permissions.
10. Start or restart the Node.js application.
11. Hard refresh the website and sign in again with Discord.

## Expected folder layout

```text
app/.next
app/public
app/database/003_community_foundation.sql
app/DEPLOYMENT-v0.3.md
app/package.json
app/server.js
app/VERSION
app/.env.production.local
app/node_modules
```

## First checks

- The browser tab shows the Game Night Tools icon instead of a globe.
- The main header no longer lists the bracket tool directly.
- The Tools page contains the bracket, random teams, matchups, map picker, announcement builder, and countdown tools.
- Signing in sends unfinished profiles to onboarding.
- Existing users receive an automatic unique site username.
- The dashboard server cards show configured banners and logos.
- Platform owners can open the private Staff Dashboard.
- Server owners can save and test a Discord webhook.

## Webhook encryption

Webhook URLs are encrypted using `WEBHOOK_ENCRYPTION_KEY` when it is configured. When it is not configured, the existing `AUTH_SECRET` is used. `AUTH_SECRET` must remain unchanged after webhooks are connected or stored webhook URLs will no longer decrypt.

No new environment variable is required for this release. A separate long random `WEBHOOK_ENCRYPTION_KEY` may be added later for key separation.

## Rollback

The v0.3 database migration adds columns and tables without deleting v0.2 data. Rolling the code back to v0.2.1 will ignore the new tables, but do not re-import migration 003 when returning to v0.3.
