# Product roadmap

## Shipped foundation

- Required Discord login using `identify`, `guilds`, and `connections`
- Automatic detection of registered Discord server workspaces
- Platform owner creation of server profiles and assignment of owner Discord IDs
- Workspace owners, admins, staff, approved hosts, referees, and viewers
- Staff, host, and event codes with expiration and configurable use limits
- Event creation, staff approval, co-host permissions, signups, check-in, waitlists, and participant management
- Imported and manually editable game identities
- Community chat, announcements, notifications, suggestions, templates, and event-hosting QOL

## v0.5 — Competitive Events

- Single-elimination brackets with automatic byes and winner advancement
- Custom three-player advancement with the no-rematch A/B/C rule
- Random placement or host-controlled placement
- Approved event participants imported with linked Game Night Tools user IDs
- Shared bracket state for hosts and bracket-enabled co-hosts
- Normalized `bracket_entries` and `bracket_matches` persistence alongside the saved visual state
- Bracket lifecycle: generated, live, completed, and reopen for corrections
- Read-only live/completed bracket viewing from the event page
- Completed bracket locking and audited status changes
- PNG bracket export

## Next — Tournament operations

- Match scheduling and ready checks
- Result confirmation between players/teams
- Disputes, proof uploads, forfeits, and staff overrides with required reasons
- More detailed match scoring and game/map results
- Public share links for events that explicitly allow anonymous spectators
- Round robin, double elimination, groups-to-playoffs, and team brackets
- Scoreboards, timers, player picker, team generator, and game/map picker

## Later — Optional Discord bot

- Bot installation remains optional
- Opt-in Discord DM reminders
- Signup, check-in, match, and winner announcements
- Slash commands and automatic result posts
- Optional role synchronization and temporary match channels
- Clear failure handling when Discord privacy settings block DMs

## Later — Community history

- Server leaderboards and game-specific statistics
- Player profiles, attendance, no-show history, wins, losses, and streaks
- Reusable event, rule, signup, game, and announcement templates
- Event recap generator and Discord-ready images
- Prizes, claim status, and delivery records
- Calendar files and calendar-service links
