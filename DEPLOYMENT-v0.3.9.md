# Game Night Tools v0.3.9 deployment

v0.3.9 is a small access-management UI and owner-identity hotfix for v0.3.8.

## Database

No new database migration is required.

This release assumes `database/004_access_control.sql` from v0.3.8 has already been imported exactly once.

Do not re-import migrations 001, 002, 003, or 004 for this hotfix.

## Included fixes

- Permission cards use a fixed checkbox column so every permission is aligned consistently.
- High-risk permission cards no longer allow the global form input styles to stretch checkboxes.
- Owner claims that are still waiting for first login continue to show the permanent Discord ID.
- Once a claimed Owner has registered, the Owner identity section automatically shows their avatar, Game Night Tools/site username, Discord username, and underlying Discord ID.
- Discord Owner claims remain durable after registration instead of disappearing from the ownership mapping.
- On Discord login, a claimed Owner is normalized to permanent active Owner access with the Owner label, no expiration, and no stale permission overrides.

## DirectAdmin update

1. Stop the Game Night Tools Node.js application.
2. Upload and extract `gamenight-tools-v0.3.9-directadmin.zip` into `domains/gamenights.sayrejeri.com/app`.
3. Keep `.env.production.local` and `node_modules` untouched.
4. Confirm the extracted `VERSION` says `0.3.9` and a real `.next` directory exists.
5. Restart the application.
6. Hard refresh the website and test Server access management.

Do not run `npm install`, `next build`, or any database migration on DirectAdmin for v0.3.9.
