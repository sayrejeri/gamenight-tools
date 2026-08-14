# Game Night Tools v1.0 — Test Plan

This plan is the focused release gate for **Platform Polish & Discord Bot Beta**.

Do not mark v1.0 ready for review until the exact final branch head passes regression smoke tests, Four Seasons worker syntax validation, TypeScript typecheck, production build, and the applicable manual checks below.

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

Verify:

- `discord_bot_jobs.match_id` exists and references `bracket_matches(id)`.
- Match-job index exists for `match_id`, job type, and status.
- Migration 011 is not rerun after success.
- Existing `workspaces.bot_connected` data remains intact.

## 3. Platform profile administration

### Team profiles

- Platform Owner can open Staff Dashboard → Team profiles.
- Platform Admin with default permissions can open Team profiles.
- A staff member granted **Manage Team Profiles** can open/edit teams even if their title is not Owner/Admin.
- A staff member denied **Manage Team Profiles** cannot open team administration pages or PATCH the staff team endpoint.
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
- Earned competitive badges appear only when event-history privacy permits them.
- Tournament Champion/Dynasty/On Fire/Tournament Veteran/Battle Tested/Reliable/Perfect Tournament still derive from competitive history rather than self-selection.
- Mouse hover and keyboard focus expose badge label/description.
- Phone-width focus/hover description remains visible and does not overflow.
- Reduced-motion preference removes badge tooltip animation.

## 5. Discord application setup

Website environment contains:

```text
DISCORD_CLIENT_ID
DISCORD_BOT_TOKEN
DISCORD_PUBLIC_KEY
BOT_WORKER_SECRET
```

Verify:

- Bot token is never exposed in rendered HTML, API responses, logs, or Git history.
- `BOT_WORKER_SECRET` differs from `AUTH_SECRET` and `CODE_PEPPER`.
- Discord Interactions Endpoint accepts the signed PING and rejects an invalid signature.
- Restarting the website after environment changes succeeds.

## 6. Bot installation and connection

- Workspace manager with **Manage Server Profile** can see Bot Settings.
- User without that permission cannot open Bot Settings or bot configuration/queue APIs.
- Install URL is locked to the workspace Discord guild.
- Bot installs successfully.
- **Check connection** changes the website to Connected after install.
- Removing the bot then checking again changes it to Not connected.
- Connection-state changes write audit entries.
- Successful connection check registers current guild slash commands.
- Command-registration failure can be surfaced without corrupting workspace connection state.

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
- Settings persist after refresh and write audit entries.
- Missing category prevents create-channel jobs.
- Missing announcement channel prevents announcement jobs.
- Missing configured role prevents the corresponding role-sync job.

### Delivery-time setting changes

Queue a job, then change settings before Four Seasons claims it:

- Disable server DMs → queued DM becomes CANCELLED rather than delivered.
- Disable announcements → queued announcement becomes CANCELLED.
- Disable role sync → queued role job becomes CANCELLED.
- Disable temporary match-channel creation → queued create-channel job becomes CANCELLED.
- Existing temporary-channel cleanup remains deliverable even when creation is disabled.

## 8. User Discord DM preferences

New users/default state:

- Main bot DM toggle is OFF.
- Individual event/check-in/match/result categories may default ON underneath it but cannot send while the main toggle is OFF.

Verify:

- Main opt-in persists.
- Each reminder category persists independently.
- Preferences write an audit entry.
- Turning main opt-in/category OFF prevents future jobs of that type.
- **After a DM job is already queued**, turning the main toggle or relevant category OFF causes the claim-time safety check to CANCEL it.
- Discord privacy blocking the bot creates a failed delivery state without repeated spam.

## 9. Four Seasons worker

Deploy `bot-worker/` with:

```text
GNT_APP_URL
BOT_WORKER_SECRET
DISCORD_BOT_TOKEN
BOT_WORKER_ID
BOT_WORKER_VERSION
BOT_POLL_SECONDS
BOT_CLAIM_LIMIT=1
BOT_SCHEDULE_SECONDS
```

Verify:

- Worker starts on Node.js 20.9+ with `npm start`.
- `node --check bot-worker/index.mjs` succeeds.
- Worker does not receive `DATABASE_URL`, `AUTH_SECRET`, `CODE_PEPPER`, or `DISCORD_CLIENT_SECRET`.
- Wrong `BOT_WORKER_SECRET` receives 401 from internal APIs.
- Correct secret can schedule/claim/report jobs.
- Recommended claim limit is 1 and the startup log reports it.
- Website requests stop after roughly 15 seconds if unreachable.
- Discord requests stop after roughly 20 seconds if unreachable.
- Bot Settings shows worker online within 90 seconds of heartbeat.
- Stopping worker eventually shows worker offline.
- Worker ID/version/last heartbeat display correctly.

## 10. Queue reliability and controls

- Scheduler can safely run once per minute without duplicate trigger jobs.
- Unique dedupe keys prevent repeated scheduling for the same trigger.
- Match-related jobs persist their real `match_id`.
- Claim revalidates current settings/privacy/event/match/role state before PROCESSING.
- Invalid/stale jobs move PENDING → CANCELLED with a useful reason.
- Valid claim moves PENDING → PROCESSING and increments attempts.
- Successful report moves PROCESSING → SENT.
- Retryable failure requeues after the retry delay.
- Permanent Discord 400/401/403/404 failures do not retry forever.
- Job stops retrying after five attempts.
- PROCESSING lock older than **2 minutes** is recovered.
- Event/match deletion cascades do not leave invalid queued foreign keys.
- Worker outage leaves due jobs waiting instead of losing them.

### Workspace queue controls

- Bot Settings displays recent job type/status/attempt count/error without payload contents.
- **Retry failed** requires Manage Server Profile permission.
- Retry resets FAILED jobs to PENDING/attempt 0/current schedule.
- Retried jobs still go through delivery-time revalidation.
- **Cancel queued** requires confirmation and only changes PENDING jobs.
- Manual cancel does not mutate an already PROCESSING job.
- Retry/cancel actions write audit entries with affected counts.

## 11. DM reminder scheduler

Use test events/matches with short times where practical.

### Event reminder

- Approved participant with DM/event reminders enabled receives one reminder around the 24-hour window.
- Non-approved/rejected/withdrawn participant does not receive it.
- If participation/event state changes after queueing, delivery-time validation cancels the stale job.

### Check-in reminder

- Approved participant who has not checked in receives one reminder after check-in opens.
- Already checked-in participant does not receive it.
- If participant checks in after queueing but before delivery, queued reminder is cancelled.
- Link opens the correct event.

### Match reminder

- Scheduled match roughly 20–40 minutes away queues a match reminder.
- Link opens `/dashboard/events/{eventId}/matches`.
- If the match is completed/rescheduled outside the delivery window before claim, stale reminder is cancelled.

### Result confirmation

- Non-submitting opponent receives a result-confirmation reminder while match is awaiting confirmation.
- Submitter does not receive their own confirmation reminder.
- If result becomes confirmed/disputed/resolved before delivery, stale confirmation DM is cancelled.
- Link opens the Series Desk.

## 12. Discord message idempotency

Test DMs and announcements with a controlled worker/report interruption:

- Outbound message carries a job-derived Discord nonce with nonce enforcement.
- A quick retry of the same job does not create a second message when Discord still recognizes the nonce.
- A Discord success followed by a failed website success-report is logged as a success-report failure, not deliberately reported back as a Discord delivery failure.
- Success-report callback retries up to three times.
- After stale-lock recovery, retry remains safe/idempotent.

## 13. Discord slash commands

After Check connection, verify:

```text
/gnt status
/gnt events
/gnt matches
/gnt bracket
/gnt leaderboard
```

- Valid guild commands immediately receive a deferred ephemeral acknowledgment.
- Artificially delay command database work beyond 3 seconds; Discord still receives the finished edited response.
- Deferred error path edits the original response with a safe generic error.
- `/gnt status` reports connected workspace/upcoming count.
- `/gnt events` returns up to five SERVER/PUBLIC events and valid links.
- `/gnt matches` does not expose hidden/draft events.
- `/gnt bracket` links to `/dashboard/events/{eventId}/bracket`.
- `/gnt leaderboard` defaults to public players.
- `type:Teams` returns public team rankings.
- Leaderboards do not expose private profile/event competitive history.
- Unregistered guild gets a safe not-connected response.

## 14. Discord announcements

- Recently published SERVER/PUBLIC event queues one announcement.
- Private/staff/code-only/unlisted event is not announced.
- Match READY/LIVE queues one match-ready announcement.
- Completed/forfeit match queues one result announcement naming the winner.
- Completed bracket queues one tournament-winner announcement.
- Repeated scheduler runs do not duplicate the trigger job.
- If event visibility/status changes after queueing, claim-time validation cancels stale announcement.
- Deleted/missing announcement channel fails safely and does not alter event/bracket state.

## 15. Temporary match channels

With the feature enabled and a configured category:

- READY/LIVE match creates one Discord text channel.
- Channel is placed in configured category.
- `@everyone` cannot view it.
- Bot has its own explicit overwrite and can post/manage despite the everyone deny.
- Match participants can view/send/read history.
- Team membership uses saved event roster snapshot, not current team roster.
- Topic contains the hidden `gnt-match:<match-id>` marker.
- Intro message identifies event/round/match/entrants and Match Center link.
- `discord_match_channels` stores mapping ACTIVE after success.

### Creation race/idempotency

- While one CREATE_MATCH_CHANNEL job is PENDING/PROCESSING, scheduler cannot queue another for the same match.
- Simulate Discord creating the channel but the website report failing; retry discovers/reuses the topic-marked existing channel instead of creating a duplicate.
- If a match is later reopened after the old channel is cleaned/deleted, a new channel can be created when appropriate.

### Cleanup

- COMPLETED/FORFEIT match queues deletion.
- Completed/cancelled event or completed bracket cleans remaining channels.
- Successful deletion marks mapping DELETED.
- Already-deleted Discord channel (404) counts as successful cleanup.
- Turning off creation after channels exist does not block cleanup.

## 16. Role synchronization

### Competitor role

- Approved direct participant in active event receives competitor role.
- Registered team-entry snapshot members receive competitor role.
- Completing/cancelling an event removes role only when user has no other active competition in the workspace.
- POSTPONED competition prevents premature removal.
- If eligibility changes after queueing, claim-time validation cancels stale ADD/REMOVE.
- Removed/missing role permission fails safely.

### Champion role

- Direct-player champion receives champion role after bracket completion.
- Team champion snapshot members receive champion role.
- If bracket/champion state no longer supports the queued award before delivery, the job is cancelled.
- Repeated scheduler passes do not duplicate role jobs.

## 17. Worker failure isolation

Deliberately remove Discord permissions and verify:

- DM failure does not change signup/check-in/match state.
- Announcement failure does not change event status.
- Match-channel failure does not change match status or advancement.
- Role-sync failure does not change participant/team/champion records.
- Failure appears in queue health/recent jobs.
- Worker continues polling after individual failures.
- A hung network request times out rather than holding the worker indefinitely.

## 18. Mobile/accessibility/navigation

- Staff Team Profiles pages work at phone width.
- Bot Settings cards/forms/recent-job rows do not overflow.
- Worker health stat cards wrap correctly.
- Retry/cancel controls remain usable with touch and keyboard.
- Public badge strip wraps correctly and badge descriptions remain accessible on mobile/focus.
- Mobile hamburger contains Home, Events, Servers, Teams, Leaderboards, Community, Suggestions, Tools, and Search.
- Current mobile navigation route exposes `aria-current="page"` and a visible non-color-only indicator.
- Reduced-motion preferences disable added v1.0 UI motion.
- Form labels are associated with inputs.

## 19. CI/release gate

PR regression workflow must include and pass:

1. Regression smoke tests.
2. `node --check bot-worker/index.mjs`.
3. `npm run typecheck`.
4. `npm run build`.

Only mark PR ready for review when the **exact final branch head** is green and:

- migration 011 succeeds on backup/staging DB;
- website-only operation is healthy with bot/worker disabled;
- Four Seasons completes heartbeat, queue, DM/announcement, temporary-channel, role-sync, and recovery smoke checks;
- Discord slash-command endpoint is verified in Developer Portal;
- no unresolved genuine release-blocking review findings remain.
