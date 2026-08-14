# Game Night Tools v1.0 — Discord Bot Preflight Tests

Use this checklist with `docs/V100_TEST_PLAN.md` before moving PR #34 out of draft.

## Configuration validator

Run these checks against a controlled Discord server with the v1.0 bot installed and the website connection marked Connected.

### Announcement channel

- Valid text channel in the connected guild → PASS.
- Valid announcement channel in the connected guild → PASS.
- Channel ID from a different Discord server → FAIL.
- Category/voice/forum/non-message channel ID used as announcement target → FAIL.
- Bot denied View Channel by channel/category overwrite → FAIL.
- Bot denied Send Messages → FAIL.
- Bot denied Embed Links → FAIL.
- Bot denied Read Message History → FAIL.
- Announcements enabled with no announcement channel configured → FAIL.
- Announcements disabled with no channel configured → SKIP.

### Temporary match category

- Valid category in the connected guild with View Channel + Manage Channels → PASS.
- Category ID from another guild → FAIL.
- Normal text/voice/forum channel ID used as category → FAIL.
- Bot missing View Channel on category → FAIL.
- Bot missing Manage Channels on category → FAIL.
- Temporary match channels enabled with no category → FAIL.
- Feature disabled with no category configured → SKIP.

### Competition roles

- Assignable role below the bot's highest Discord role → PASS.
- Role ID from another guild / missing role → FAIL.
- `@everyone` role ID → FAIL.
- Discord/integration-managed role → FAIL.
- Bot missing Manage Roles → FAIL.
- Target role equal to or above bot's highest role → FAIL.
- Role sync enabled with only Competitor configured → Competitor PASS, Champion WARN.
- Role sync enabled with only Champion configured → Champion PASS, Competitor WARN.
- Role sync disabled and no roles configured → SKIP.

### Unsaved-value behavior

- Change IDs in the form without saving.
- Run **Validate Discord configuration**.
- Confirm validation uses the currently typed values, not the last saved database values.
- Save only after intended checks pass/warn as expected.

## Private match-channel access

Create a READY/LIVE tournament match in a controlled event.

### Players

- Direct player A → channel access.
- Direct player B → channel access.
- Direct player C in supported three-player match → channel access.
- Team tournament → saved event roster snapshot members get access.
- Member added to the live team after event roster snapshot → does not automatically gain snapshot-based access.

### Staff

- Primary event host → channel access.
- Accepted, unexpired FULL co-host → channel access.
- Accepted, unexpired BRACKET co-host → channel access.
- Accepted, unexpired SCOREKEEPER co-host → channel access.
- ANNOUNCEMENT_ONLY co-host → no private match-channel access.
- VIEW_ONLY co-host → no private match-channel access.
- Pending co-host invite → no access.
- Declined/revoked co-host → no access.
- Accepted co-host whose invitation is expired → no access.

### Discord privacy/permissions

- `@everyone` cannot see the created match channel.
- Game Night Tools bot can see/post/manage despite the everyone deny.
- Eligible members can View Channel, Send Messages, and Read Message History.
- Unrelated Discord members cannot see the channel unless another Discord permission outside Game Night Tools explicitly grants them access.

### Execution-time access refresh

Before Four Seasons executes a queued CREATE_MATCH_CHANNEL job:

- Add an eligible BRACKET/SCOREKEEPER co-host and confirm they are included when channel is created.
- Revoke/expire a co-host before execution and confirm they are excluded.
- Confirm access is resolved by the website at channel-creation time rather than relying only on stale queue payload IDs.

## Match-channel idempotency

- First valid creation writes topic marker `gnt-match:<match-id>`.
- Website stores ACTIVE `discord_match_channels` mapping after success.
- Simulate success-report failure after Discord created channel.
- Retry same job and confirm worker reuses topic-marked channel instead of creating a second channel.
- Complete/forfeit match and confirm cleanup queues.
- Delete channel manually before cleanup; Discord 404 is treated as successful cleanup.

## Tracked-role reconciliation

### Competitor

- Add configured competitor role A to active participant.
- Confirm ACTIVE `discord_role_assignments` record for exact role A.
- Change workspace configured role to B.
- Confirm B can be added while tracked A is queued for removal.
- Confirm A removal targets historical role A, not current role B.
- Disable role sync while A/B assignment is active; tracked role cleanup still runs.
- Keep participant active in another event; competitor assignment is retained until no active competition remains.

### Champion

- Complete tournament and confirm champion role assignment is tracked.
- Reopen/correct bracket so tracked user/team is no longer champion.
- Reconciliation queues removal of exact historical champion role.
- Change Champion role ID after assignment and confirm old role is removed while future awards use new role.

## Queue controls

- Create a controlled FAILED bot job by removing a required Discord permission.
- Fix Discord permission.
- **Retry failed** → FAILED jobs return to PENDING/attempt 0.
- Confirm retried job still passes delivery-time state validation.
- Queue a controlled PENDING job.
- **Cancel queued** → confirmation required and only PENDING work is cancelled.
- Confirm manual cancellation does not immediately recreate the same trigger.
- Confirm automatic safety cancellation releases its dedupe key and can later reschedule fresh valid work.

## Commands

Verify:

```text
/gnt status
/gnt events
/gnt matches
/gnt bracket
/gnt leaderboard
```

- Commands return ephemeral responses.
- Artificially delay database work beyond three seconds and confirm deferred/edit-original handling still completes.
- Player leaderboard uses public competition history only.
- Team leaderboard uses public team competition history only.
- Hidden/private event data is not exposed by event/match/bracket commands.

## Failure isolation

For each test below, confirm website competition state remains correct:

- Discord DM blocked by privacy settings.
- Announcement channel missing permission.
- Match category missing Manage Channels.
- Synced role moved above bot hierarchy.
- Discord API temporarily unavailable.
- Four Seasons temporarily unable to report success back to website.

A Discord integration failure must never decide a winner, alter a bracket, reverse a result, or prevent the website from continuing the tournament.
