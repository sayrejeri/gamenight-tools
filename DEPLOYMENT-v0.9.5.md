# Game Night Tools v0.9.5 — Deployment

## Release scope

v0.9.5 adds Teams & Server Identity:

- Platform Owner toggle for whether new server profiles require platform review.
- Separate Game Night Tools profile approval from per-server team approval.
- Team-to-server affiliation requests and server-to-team invitations.
- Approval, denial, and revocation flows for affiliations.
- Protected Roblox private-server links for accepted team members.
- A central `/dashboard/team-server-identity` management page.

Premium, cosmetics, and event-specific match private servers are not part of v0.9.5.

## Database migration — required once

**Back up the database first.**

Import exactly once:

```text
database/010_team_server_identity.sql
```

Do **not** rerun migrations `001` through `009`, and do not rerun `010` after it succeeds.

Migration 010:

- creates `platform_settings`;
- creates `team_workspace_affiliations`;
- adds `teams.private_server_url`;
- preserves existing approved `home_workspace_id` team relationships as approved affiliations.

The production database is expected to move from **48 to 50 base tables**.

Verification query:

```sql
SELECT COUNT(*) AS table_count
FROM information_schema.tables
WHERE table_schema = DATABASE()
  AND table_type = 'BASE TABLE';
```

Expected result after migration 010: `50`.

## Pre-merge release gate

1. Confirm PR **PR regression checks** is green on the exact final v0.9.5 head.
2. Complete the focused checks in `docs/V095_TEST_PLAN.md`.
3. Run **Local release verification** with ref:

```text
feature/v0.9.5-teams-server-identity
```

4. Merge only after the exact branch head is green and there are no genuine release-blocking issues.

## After merge

Run **Local release verification** again with:

```text
main
```

Confirm `VERSION` is `0.9.5`.

The deployment ZIP should be created at:

```text
C:\GameNightToolsRelease\gamenight-tools-v0.9.5-directadmin.zip
```

The post-merge `main` ZIP is the deployment artifact. Do not deploy the pre-merge branch ZIP as the final release.

## DirectAdmin deployment

1. Back up the currently deployed application and database.
2. Apply `database/010_team_server_identity.sql` **once**.
3. Confirm the database now has **50** base tables.
4. Upload the verified v0.9.5 `main` ZIP.
5. Extract it over the application directory using the normal Game Night Tools deployment process.
6. Restart the Node.js application.
7. Perform the post-deploy smoke checks below.

## Post-deploy smoke

- Existing events, brackets, Match Center, descriptions, profiles, teams, and servers still load normally.
- Platform Owner can open **Teams & server identity** and toggle server-profile approval.
- With approval required ON, a new server profile enters normal staff review.
- With approval required OFF, a Discord server owner/manager can create an approved server profile immediately.
- Turning approval off does not allow a user to create a profile for a Discord server they do not own/manage.
- Team profiles still use the normal Game Night Tools profile approval process.
- A team Owner/Manager can request approval from a server.
- Server staff with **Manage Teams** can approve/deny the request.
- Server staff can invite an approved team and the team Owner/Manager can approve/deny it.
- Either authorized side can revoke an approved affiliation.
- A team can have more than one approved server affiliation.
- Accepted team members can see the configured Roblox private-server button.
- Non-members/public viewers cannot see the private-server URL.
- Team Owner/Manager/Captain can update or clear the private-server URL.
- Invalid/non-Roblox and normal Roblox game-page URLs are rejected as private-server links.

## Rollback note

If application deployment must be rolled back after migration 010, do **not** blindly remove the new tables/column or rerun older migrations. Restore the matching pre-deploy database backup if a full schema rollback is actually required.
