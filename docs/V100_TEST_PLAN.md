# Game Night Tools v1.0 — Test Plan

This plan is the focused release gate for **Platform Polish & Discord Bot Beta**.

Do not mark v1.0 ready for review until the exact final branch head passes regression checks, TypeScript typecheck, production build, and the applicable manual checks below.

## 1. Baseline regression

- Existing Discord login still succeeds.
- Dashboard, server profiles, team profiles, user profiles, events, brackets, Match Center, Series Desk, Control Room, leaderboards, community chat, suggestions, notifications, and staff pages still load.
- Existing webhook-only servers continue working without installing the Discord bot.
- A workspace with no bot installed can still create/run events and tournaments normally.
- A stopped Four Seasons worker does not break website event, bracket, result, profile, or chat workflows.

## 2. Migration 011

Back up the database first, then import once:

```text
database/011_v100_discord_bot_beta.sql
```

Verify these tables exist:

```text
workspace_bot_settings
user_discord_bot_preferences
discord_bot_jobs
discord_bot_workers
discord_match_channels
```

Verify migration 011 is not rerun after success.

Verify existing `workspaces.bot_connected` data remains intact.

## 3. Platform profile administration

### Team profiles

- Platform Owner can open Staff Dashboard → Team profiles.
- Platform Admin with default permissions can open Team profiles.
- A staff member granted **Manage Team Profiles** can open/edit teams even if their title is not Owner/Admin.
- A staff member denied **Manage Team Profiles** cannot open the team administration pages or PATCH the staff team endpoint.
- Search matches team name, tag, slug, and game.
- Status filtering works.
- Staff can edit name/tag, description, logo/banner, platform/game, region, recruiting status, profile status, verification, chat, and suggestions.
- Team edit works without the staff user joining the roster.
- Changing status/verification creates a sensitive/permission-level audit entry.
- Normal profile edits create an audit entry.
- Team roster ownership, affiliations, protected private-server links, and destructive workflows remain guarded by their existing flows.

### Server profiles

- A staff member with **Manage Server Profiles** can open the Staff Dashboard server browser regardless of title.
- Denying **Manage Server Profiles** removes access to the staff server browser.
- Existing platform server-management inheritance continues to give appropriate workspace management access when opening a server.

## 4. Public profile badges

- Platform Owner/Admin/Reviewer/Moderator/Support badges display for active platform staff roles.
- Verified game identity badge displays only when at least one displayed identity is verified/resolved.
- Team Owner badge only derives from approved visible team ownership.
- Server Owner badge only derives from approved visible server ownership.
- Badges are compact and do not replace normal profile content.
- Mouse hover shows badge label/description.
- Keyboard focus exposes the same badge information.
- Mobile layout does not overflow when multiple badges are shown.
- Users cannot award themselves any of these derived badges.

## 5. Discord application setup

Website environment contains:

```text
DISCORD_CLIENT_ID
DISCORD_BOT_TOKEN
DISCORD_PUBLIC_KEY
BOT_WORKER_SECRET
```

- Bot token is never exposed in rendered HTML, API responses, logs, or Git history.
- `BOT_WORKER_SECRET` is different from `AUTH_SECRET` and `CODE_PEPPER`.
- Discord Interactions Endpoint URL accepts Discord's signed PING and rejects an invalid signature.
- Restarting the website after environment changes succeeds.

## 6. Bot installation and connection

- Workspace manager with **Manage Server Profile** can see Bot Settings.
- User without that permission cannot open Bot Settings or bot configuration APIs.
- Install URL is locked to the workspace Discord guild.
- Bot can be installed successfully.
- **Check connection** changes the website to Connected after install.
- Removing the bot then checking again changes it to Not connected.
- Connection-state changes write audit entries.
- Successful connection check registers current guild slash commands.
- Bot connection can succeed while command-registration failure is surfaced as a warning rather than corrupting workspace state.

## 7. Workspace bot settings

All advanced settings start disabled:

- member DM reminders
- announcements
- temporary match channels
- role synchronization

Verify:

- Announcement channel ID validates as a Discord snowflake or blank.
- Match category ID validates as a Discord snowflake or blank.
- Competitor role ID validates as a Discord snowflake or blank.
- Champion role ID validates as a Discord snowflake or blank.
- Settings persist after refresh.
- Setting changes write audit entries.
- Enabling temporary match channels without a category does not queue create-channel jobs.
- Enabling announcements without a channel does not queue announcement jobs.
- Enabling role sync without the corresponding configured role does not queue that role job.

## 8. User Discord DM preferences

New users/default state:

- Main bot DM toggle is OFF.
- Individual event/check-in/match/result categories may default ON underneath it but cannot send while the main toggle is OFF.

Verify:

- Main opt-in persists.
- Each reminder category persists independently.
- Preferences write an audit entry.
- Turning main opt-in OFF prevents all new DM jobs for that user.
- Turning one category OFF prevents only that category.
- Discord privacy blocking the bot creates a failed delivery state without repeatedly spamming the user.

## 9. Four Seasons worker

Deploy `bot-worker/` with:

```text
GNT_APP_URL
BOT_WORKER_SECRET
DISCORD_BOT_TOKEN
BOT_WORKER_ID
BOT_WORKER_VERSION
BOT_POLL_SECONDS
BOT_SCHEDULE_SECONDS
```

Verify:

- Worker starts on Node.js 20.9+ with `npm start`.
- Worker does not receive `DATABASE_URL`, `AUTH_SECRET`, or `DISCORD_CLIENT_SECRET`.
- Wrong `BOT_WORKER_SECRET` receives 401 from internal worker APIs.
- Correct secret can schedule/claim/report jobs.
- Bot Settings shows worker online within 90 seconds of heartbeat.
- Stopping worker eventually shows worker offline.
- Worker ID/version/last heartbeat display correctly.
- Queue pending/processing and failed counts display for the workspace.

## 10. Queue reliability

- Scheduler can safely run once per minute without duplicate user messages.
- Unique dedupe keys prevent the same trigger from being queued repeatedly.
- Claim moves due jobs PENDING → PROCESSING and increments attempts.
- Successful report moves PROCESSING → SENT.
- Retryable failure requeues after the retry delay.
- Permanent 400/401/403/404 Discord failures do not retry forever.
- Job stops retrying after five attempts.
- PROCESSING lock older than 10 minutes is recovered.
- Event deletion/cascade does not leave invalid queued foreign keys.
- Worker outage leaves due jobs waiting instead of losing them.

## 11. DM reminder scheduler

Use test events/matches with short times where practical.

### Event reminder

- Approved participant with DM/event reminders enabled receives one reminder around the 24-hour window.
- Non-approved/rejected/withdrawn participant does not receive it.
- Same scheduler trigger does not send duplicates.

### Check-in reminder

- Approved participant who has not checked in receives one reminder after check-in opens.
- Already checked-in participant does not receive it.
- Link opens the correct Game Night Tools event.

### Match reminder

- Scheduled match roughly 20–40 minutes away queues a match reminder.
- Link opens `/dashboard/events/{eventId}/matches`.
- Solo participants are included.
- Team competition authority/reminders still use the saved event roster snapshot where applicable.

### Result confirmation

- Non-submitting opponent receives a result-confirmation reminder while match is awaiting confirmation.
- Submitter does not receive their own confirmation reminder.
- Link opens the Series Desk.

## 12. Discord slash commands

After Check connection, verify these exist for the guild:

```text
/gnt status
/gnt events
/gnt matches
/gnt bracket
/gnt leaderboard
```

- Responses are ephemeral during beta.
- `/gnt status` reports connected workspace and upcoming event count.
- `/gnt events` returns up to five SERVER/PUBLIC upcoming events and valid links.
- `/gnt matches` returns active/upcoming competition matches without exposing hidden/draft events.
- `/gnt bracket` links directly to `/dashboard/events/{eventId}/bracket`.
- `/gnt leaderboard` defaults to public player rankings.
- `/gnt leaderboard type:Teams` returns public team rankings.
- Leaderboards do not expose private profile/event competitive history.
- Command used in an unrelated/unregistered guild gets a safe not-connected response.

## 13. Discord announcements

With announcements enabled and a valid channel:

- Recently published SERVER/PUBLIC event queues one event announcement.
- Private/staff/code-only/unlisted event is not announced by the public/server announcement scheduler.
- Match READY/LIVE queues one match-ready announcement.
- Completed/forfeit match queues one result announcement naming the winner.
- Completed bracket queues one tournament-winner announcement.
- Repeated scheduler runs do not duplicate the same announcement.
- Deleted/missing announcement channel fails safely and does not alter the event/bracket.

## 14. Temporary match channels

With temporary match channels enabled and a configured category:

- READY/LIVE match creates one Discord text channel.
- Channel is placed in the configured category.
- `@everyone` cannot view it.
- Match participants can view/send/read history.
- Team tournament channel membership uses the saved event roster snapshot, not the team's current live roster.
- Intro message identifies event, round/match, entrants, and Match Center link.
- `discord_match_channels` stores the match/channel mapping as ACTIVE after successful creation.
- Scheduler does not create another ACTIVE channel for the same match.
- COMPLETED/FORFEIT match queues channel deletion.
- Completed/cancelled event or completed bracket also cleans remaining channels.
- Successful deletion marks mapping DELETED.
- Already-deleted Discord channel (404) is treated as successful cleanup.
- Turning off creation after channels exist does not block cleanup of existing channels.

## 15. Role synchronization

### Competitor role

- Approved direct participant in an active event receives configured competitor role.
- Registered team-entry roster snapshot members receive competitor role.
- Completing/cancelling an event removes competitor role only when the user has no other active competition in that same workspace.
- POSTPONED active competition prevents premature role removal.
- Removed/missing role permission fails safely without changing event state.

### Champion role

- Direct-player champion receives configured champion role after bracket completion.
- Team champion's saved event roster snapshot members receive champion role.
- Repeated scheduler passes do not duplicate role jobs.

## 16. Worker failure isolation

Test with bot permissions deliberately removed:

- DM failure does not change signup/check-in/match state.
- Announcement failure does not change event status.
- Match-channel failure does not change match status or winner advancement.
- Role-sync failure does not change participant/team/champion records.
- Failure appears in queue health and can be diagnosed from job error state.

## 17. Mobile/accessibility pass

Before release:

- Staff Team Profiles pages work at phone width.
- Bot Settings cards/forms do not overflow.
- Worker health stat cards wrap correctly.
- Public badge strip wraps correctly.
- Keyboard navigation works for badge descriptions, forms, buttons, and bot actions.
- Form labels are associated with inputs.
- Important status is not communicated only through color.

## 18. Final release gate

Only mark PR ready for review when:

1. Exact final branch head has green **PR regression checks**.
2. Smoke tests pass.
3. TypeScript typecheck passes.
4. Production build passes.
5. Migration 011 succeeds on a backup/staging database.
6. Website-only operation is still healthy with bot/worker disabled.
7. Four Seasons worker completes heartbeat, queue, DM/announcement, temporary-channel, and role-sync smoke checks.
8. Discord slash-command endpoint is verified in Developer Portal.
9. No unresolved genuine release-blocking review findings remain.
