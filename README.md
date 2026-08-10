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
