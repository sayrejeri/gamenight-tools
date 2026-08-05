# Game Night Tools v0.2 DirectAdmin deployment

## Database migration required

Import `database/002_expanded_events.sql` into the existing Game Night Tools database before starting the v0.2 application build.

This migration adds expanded server profiles, saved games, event publishing stages, Roblox metadata, templates, local-time preferences, check-in settings, and bracket configuration. It does not intentionally delete existing users, workspaces, events, codes, or brackets.

## Publish steps

1. Stop the Game Night Tools Node.js application in DirectAdmin.
2. Open phpMyAdmin and select the existing `sayrejeri_gamenights` database.
3. Import `database/002_expanded_events.sql` one time.
4. In the application directory, delete the old `.next` directory only.
5. Upload and extract the `gamenight-tools-v0.2.0-directadmin` artifact into the application directory.
6. Confirm `.env.production.local` is still present and remains permission `600`.
7. Do not run `next build`, `npm install`, or a DirectAdmin build script.
8. Start or restart the Node.js application.
9. Test Discord login, profile connections, server profile editing, Roblox game importing, event creation, publishing, signup, local times, check-in, and brackets.

## Rollback

If the new build fails before public use, stop the application, restore the previous `.next` directory/build, and restart. The added database columns and tables can remain in place because the previous v0.1 code ignores them.
