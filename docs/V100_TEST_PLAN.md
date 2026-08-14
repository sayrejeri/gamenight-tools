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

Verify these **six** tables exist:

```text
workspace_bot_settings
user_discord_bot_preferences
discord_bot_jobs
discord_bot_workers
discord_match_channels
discord_role_assignments
```

Verify:

- `discord_bot_jobs.match_id` references `bracket_matches(id)`.
- Role jobs contain `role_kind` and `discord_role_id`.
- Match-job and role-job indexes exist.
- `discord_role_assignments` uniquely tracks workspace + user + role kind + exact Discord role ID.
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
- Tournament Champion/Dynasty/On Fire/Tournament Veteran/Battle Tested/Reliable/Perfect Tournament remain history-derived rather than self-selected.
- Mouse hover and keyboard focus expose badge label/description.
- Phone-width badge description remains visible and does not overflow.
- Reduced-motion preference removes added badge animation.

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

## 7. Workspace bot settings and automatic cancellation

All advanced settings start disabled:

- member DM reminders
- announcements
- temporary match channels
- role synchronization

Verify snowflake/blank validation for announcement channel, match category, competitor role, and champion role IDs. Settings must persist and write audit entries.

Queue work, then change settings before Four Seasons claims it:

- Disable server DMs → queued DM becomes CANCELLED.
- Disable announcements → queued announcement becomes CANCELLED.
- Disable temporary match-channel creation → queued create-channel job becomes CANCELLED.
- Change a configured role ID before an ADD is claimed → old-role ADD becomes CANCELLED.
- Existing temporary-channel cleanup remains deliverable after creation is disabled.
- Tracked role cleanup remains deliverable after role sync is disabled.

For automatic safety cancellation, verify `dedupe_key` is released so the scheduler can create fresh work if the setting/state becomes valid again. Manual **Cancel queued** must retain its dedupe key so the same trigger is not immediately recreated.

## 8. User Discord DM preferences

- Main bot DM toggle defaults OFF.
- Individual event/check-in/match/result categories can default ON underneath it but cannot send while main toggle is OFF.
- Main opt-in and each category persist independently and write audit entries.
- Turning main/category OFF prevents future jobs.
- Turning a preference OFF **after queueing but before claim** cancels the queued DM.
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
- Wrong `BOT_WORKER_SECRET` receives 401.
- Correct secret can schedule/reconcile/claim/report jobs.
- Recommended claim limit is 1 and startup log reports it.
- Website requests time out around 15 seconds if unreachable.
- Discord requests time out around 20 seconds if unreachable.
- Bot Settings shows worker online within 90 seconds and offline after heartbeat stops.

## 10. Queue reliability and controls

- Scheduler can run once per minute without duplicate trigger jobs.
- Match jobs persist real `match_id`.
- Role jobs persist exact `role_kind` + `discord_role_id`.
- Role dedupe keys are scoped to exact role ID so role A and role B are separate operations.
- Claim revalidates current settings/privacy/event/match/role state before PROCESSING.
- Invalid/stale jobs move PENDING → CANCELLED with a useful reason and release automatic dedupe.
- Valid claim moves PENDING → PROCESSING and increments attempts.
- Success moves PROCESSING → SENT.
- Retryable failure requeues after delay.
- Permanent Discord 400/401/403/404 failures do not retry forever.
- Job stops retrying after five attempts.
- PROCESSING lock older than 2 minutes is recovered.
- Worker outage leaves due jobs waiting instead of losing them.

### Workspace queue controls

- Recent job UI shows type/status/attempt count/error without payload contents.
- **Retry failed** requires Manage Server Profile and resets FAILED → PENDING/attempt 0/current schedule.
- Retried jobs still revalidate current state.
- **Cancel queued** requires confirmation and affects only PENDING jobs.
- Manual cancel does not mutate PROCESSING work.
- Retry/cancel actions write audit entries with affected counts.

## 11. DM reminder scheduler

### Event reminder

- Approved participant with opt-in receives one reminder around the 24-hour window.
- Rejected/withdrawn participant does not.
- Participation/event changes after queueing cancel stale delivery.

### Check-in reminder

- Approved unchecked participant receives reminder after check-in opens.
- Already checked-in participant does not.
- Checking in after queueing but before claim cancels stale reminder.

### Match reminder

- Scheduled match roughly 20–40 minutes away queues reminder.
- Link opens `/dashboard/events/{eventId}/matches`.
- Completion/reschedule outside delivery window before claim cancels reminder.

### Result confirmation

- Non-submitting opponent receives confirmation reminder while awaiting confirmation.
- Submitter does not receive their own reminder.
- Confirmation/dispute/resolution before claim cancels stale reminder.

## 12. Discord message idempotency

- Outbound DM/announcement/intro message carries a job-derived nonce with nonce enforcement.
- Quick retry of same job does not intentionally create a second message when Discord recognizes the nonce.
- Discord success followed by failed website success-report is logged as success-report failure, not reclassified as Discord delivery failure.
- Success-report callback retries up to three times.
- Stale-lock recovery remains safe/idempotent.

## 13. Discord slash commands

Verify registered commands:

```text
/gnt status
/gnt events
/gnt matches
/gnt bracket
/gnt leaderboard
```

- Valid guild command receives immediate deferred ephemeral acknowledgement.
- Artificially delay command DB work beyond 3 seconds; finished edited response still arrives.
- Deferred error path edits original response with safe generic error.
- Status/events/matches/bracket return only appropriate connected/public-or-server state.
- `/gnt bracket` links directly to bracket view.
- Leaderboard defaults to public players; Teams option returns public teams.
- Private profile/event competitive history is not exposed.
- Unregistered guild gets safe not-connected response.

## 14. Discord announcements

- Recently published SERVER/PUBLIC event queues one announcement.
- Private/staff/code-only/unlisted event is not announced.
- READY/LIVE match queues one match-ready announcement.
- Completed/forfeit match queues one result announcement.
- Completed bracket queues one winner announcement.
- Winner job is cancelled if the bracket is reopened before delivery.
- Repeated scheduler runs do not duplicate active trigger jobs.
- Visibility/status changes after queueing cancel stale announcement.

## 15. Temporary match channels

- READY/LIVE match creates one text channel in configured category.
- `@everyone` cannot view it.
- Bot has explicit overwrite and can manage/post despite everyone deny.
- Match participants can view/send/read history.
- Team membership uses saved event roster snapshot.
- Topic contains `gnt-match:<match-id>`.
- Intro identifies event/round/match/entrants and Match Center link.
- Mapping is persisted ACTIVE.

### Creation race/idempotency

- Existing PENDING/PROCESSING create prevents another scheduler create for same match.
- Simulate Discord create success + website report failure; retry finds topic marker and reuses channel.
- Reopened match after old channel cleanup can get a new channel when valid.

### Cleanup

- COMPLETED/FORFEIT match queues deletion.
- Completed/cancelled event or completed bracket cleans remaining channels.
- Successful deletion marks mapping DELETED.
- Already-deleted Discord channel 404 counts as successful cleanup.
- Turning off creation does not block cleanup.

## 16. Role synchronization and reconciliation

### Assignment tracking

After every successful role ADD verify `discord_role_assignments` records:

- workspace/user;
- COMPETITOR or CHAMPION;
- exact Discord role ID actually added;
- source event;
- ACTIVE status and timestamps.

After successful REMOVE verify that exact row becomes REMOVED with `removed_at` set.

### Competitor role

- Approved direct participant receives configured competitor role.
- Registered team snapshot members receive it.
- POSTPONED competition prevents premature removal.
- User with another active competition in same workspace keeps competitor role after one event ends.
- Once no active competition remains, reconciliation queues removal of the exact tracked role ID.

### Configuration changes

- Add role A to an active competitor and confirm ACTIVE assignment for A.
- Change configured competitor role to B while competition is still active.
- Scheduler can queue a distinct ADD for B because dedupe includes exact role ID.
- Reconciliation queues REMOVE for tracked A even though A is no longer the configured role.
- Successful A removal releases completed/cancelled old-role dedupe so A can be used again later.
- Switch role sync OFF after a role was assigned; reconciliation still removes the tracked role.
- Re-enable sync with valid active competition; current configured role can be added again.

### Champion role

- Direct-player champion receives champion role after bracket completion.
- Team champion uses saved event roster snapshot.
- Reopened/corrected bracket invalidating the source champion causes tracked champion role cleanup.
- Changing champion role or disabling sync removes the historical tracked role ID.

### Delivery safety

- ADD job cancels if configured role changed before claim.
- REMOVE job only executes for an ACTIVE tracked assignment.
- Role operations never guess removal from current settings alone.
- Removed/missing Discord role permission fails safely without changing tournament records.

## 17. Worker failure isolation

Deliberately remove Discord permissions and verify:

- DM failure does not change signup/check-in/match state.
- Announcement failure does not change event status.
- Match-channel failure does not change match status/advancement.
- Role-sync failure does not change tournament records.
- Failure appears in queue health/recent jobs.
- Worker continues polling after individual failures.
- Hung network request times out rather than holding worker indefinitely.

## 18. Mobile/accessibility/navigation

- Staff Team Profiles pages work at phone width.
- Bot Settings cards/forms/recent-job rows do not overflow.
- Worker health stat cards wrap correctly.
- Retry/cancel controls work by touch and keyboard.
- Public badge strip wraps and descriptions remain accessible on mobile/focus.
- Mobile hamburger contains Home, Events, Servers, Teams, Leaderboards, Community, Suggestions, Tools, and Search.
- Current route exposes `aria-current="page"` plus visible non-color-only indicator.
- Reduced-motion preference disables added v1.0 UI motion.
- Form labels are associated with inputs.

## 19. CI/release gate

PR regression workflow must pass on the **exact final head**:

1. Regression smoke tests.
2. `node --check bot-worker/index.mjs`.
3. `npm run typecheck`.
4. `npm run build`.

Only mark PR ready when:

- migration 011 succeeds on backup/staging DB;
- website-only operation is healthy with bot/worker disabled;
- Four Seasons completes heartbeat, queue, DM/announcement, temporary-channel, exact-role reconciliation, and recovery smoke checks;
- Discord slash-command endpoint is verified in Developer Portal;
- no unresolved genuine release-blocking review findings remain.
