# Game Night Tools

A Discord-authenticated event, signup, workspace, code, co-host, and tournament platform for `gamenights.sayrejeri.com`.

## Current foundation

- Discord OAuth login is required for the private dashboard.
- Discord guild memberships are imported at login so registered server workspaces can display their events.
- Discord connections are imported and can be edited or hidden by the user.
- Server workspaces support owners, admins, staff, approved hosts, referees, and viewers.
- Staff, host, and event join codes support expiration, one-time use, and configurable use limits.
- Event hosts can invite co-hosts with scoped permissions.
- The database includes initial bracket, match, participant, notification, and audit-log models.
- The Discord bot remains optional and is not required for website access.

## Local setup

1. Copy `.env.example` to `.env.local` and fill in the values.
2. Create a dedicated MariaDB/MySQL database and user.
3. Run `database/001_initial.sql` in phpMyAdmin.
4. Install dependencies with `npm install`.
5. Run `npm run dev`.

## Production build

```bash
npm install
npm run build
npm run start
```

The project uses Next.js standalone output so it can be self-hosted through a Node.js application manager.

## Discord OAuth redirect

Add this redirect URI in the Discord Developer Portal:

```text
https://gamenights.sayrejeri.com/api/auth/discord/callback
```

Requested user scopes:

- `identify`
- `guilds`
- `connections`

No bot installation is required for login or server detection.
