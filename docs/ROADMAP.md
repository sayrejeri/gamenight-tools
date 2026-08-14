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

## v0.6 — Tournament Operations

- Match Center for live bracket operations
- Stable normalized entry and match IDs across bracket saves
- Player ready checks and live match state
- Match scheduling, best-of settings, no-show grace periods, and tournament pause/resume
- Player-submitted results with scores, notes, and optional screenshot/video proof URLs
- Opponent confirmation before normal results advance the bracket
- Disputes with reasons/evidence and staff resolution
- Staff result overrides, forfeits/no-shows, and required decision reasons
- Confirmed results automatically advance both single-elimination and three-player brackets
- Reopen/correct results with dependent downstream selections cleared safely
- Match notifications, Discord webhook tournament updates, and audited match actions
- Event standings, personal career wins/losses, current streaks, championships, and event head-to-head records

## v0.7 — Expanded Competition Formats

- Double-elimination tournaments with winners/losers brackets and grand-final reset logic
- Round-robin tournaments with live standings
- Groups-to-playoffs with serpentine group seeding and automatic qualifier slots
- Configurable standings tiebreaks using head-to-head then seed, or original seed/order
- Team tournament entry mode using approved Game Night Tools teams
- Event roster snapshots so team match authority does not change unexpectedly when a team profile changes
- Team-aware ready checks, result reporting, opponent confirmation, disputes, forfeits, and Match Center notifications
- Expanded stage metadata and stable normalized match IDs across all supported competition formats
- Read-only spectator rendering and PNG export for all supported formats
- Host-generated anonymous spectator links that expose only live/completed public competition state
- Existing single-elimination and custom three-player formats remain supported by the same Match Center workflow

## v0.8 — Game Night Tools & Series

- Game Night Studio with a live scoreboard and presentation mode
- Countdown and stopwatch controls with fast round presets
- Player picker with no-repeat cycles and random team generation
- Persistent saved game/map/mixed pools with optional item details
- Random saved-pool selection without repeats until the cycle is exhausted
- Structured best-of series reporting with game-by-game map/mode, winner, and optional per-game scores
- Saved pools can seed randomized opening maps directly inside tournament series reporting
- Series results use the existing opponent-confirmation, dispute, and bracket-advancement workflow
- Event Control Room combines live match attention, scoreboard, timer, and saved-pool picking for tournament staff
- Competition pages link staff into the Control Room and participants into the Series Desk

## v0.9 — Competitive Profiles & Leaderboards

- Dedicated competitive player profile pages
- Career and current-season W/L, win rate, championships, events played, and streaks
- Player and approved-team leaderboards
- All-time and quarterly seasonal ranking views
- Server/workspace and game-specific leaderboard filters
- Tournament history, recent opponents, and game-by-game competitive records
- Attendance/check-in and no-show reliability stats
- Automatically derived competitive badges and profile highlights
- Existing profile privacy and block rules apply to competitive history
- Series reporting hardened so hidden/cancelled/postponed/draft events cannot mutate live match state

## Next — v1.0 Platform Polish & Discord Bot Beta

- Platform Owner/Admin team-profile administration from the Staff Dashboard, matching the existing server-profile administration flow
- Discord-style profile badge system for platform roles, verified/official status, competitive achievements, and future earned badges
- Optional Discord bot installation per workspace
- Opt-in Discord DM reminders for signups, check-in, scheduled matches, and result confirmation
- Signup, check-in, match-ready, match-result, and tournament-winner announcements
- Slash commands for event status, upcoming matches, brackets, standings, and leaderboards
- Optional temporary match channels with cleanup after completion
- Optional role synchronization for hosts, competitors, champions, and event-specific roles
- Clear failure handling when Discord privacy settings block DMs or the bot lacks permissions
- Mobile and accessibility polish across tournament, profile, and leaderboard screens
- Public competitive pages and spectator presentation polish
- Final navigation, onboarding, settings, staff administration, and permission cleanup for the 1.0 milestone

## Later — Community history and event QOL

- Reusable event, rule, signup, game, and announcement templates
- Event recap generator and Discord-ready images
- Prizes, claim status, and delivery records
- Calendar files and calendar-service links
- Ranked seasons/MMR as an optional competitive mode after the history system has enough real match data
