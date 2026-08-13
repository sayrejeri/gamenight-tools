# v0.9.5 Teams & Server Identity — Test Plan

## Automated gate

The permanent **PR regression checks** workflow must pass on the exact final PR head. It covers existing competition regressions, rich-description regressions, TypeScript typecheck, and the production build.

Do not create a version-specific v0.9.5 workflow.

## Migration

- Back up a test/staging database where possible.
- Apply `database/010_team_server_identity.sql` once.
- Confirm base table count changes from 48 to 50.
- Confirm existing approved teams with a `home_workspace_id` appear as approved affiliations.
- Do not rerun migrations 001-009.

## Server profile approval policy

### Approval required ON

- Platform Owner sees **Server profile approval** set to required.
- Eligible server request is created as PENDING.
- Existing staff profile-review workflow can approve/deny/request changes.

### Approval required OFF

- Platform Owner can switch the policy off and refresh without losing the setting.
- A user who owns a Discord server can create its profile immediately.
- A user with Discord Manage Server/Administrator can create its profile immediately.
- The new workspace is APPROVED, has the requester as active OWNER, and gets the normal owner claim.
- The requester receives a “Server profile created” notification.
- A user without ownership/Manage Server authorization is still rejected.
- Duplicate workspace/profile requests are still rejected.
- Team profile requests remain PENDING for normal Game Night Tools review.

## Team ↔ server affiliations

### Team requests server approval

- Active team OWNER can request an approved server.
- Active team MANAGER can request an approved server.
- Captain/Player cannot create the affiliation request.
- Server owners/managers with `MANAGE_TEAMS` can approve or deny the incoming request.
- An approved affiliation appears on the identity dashboard.

### Server invites team

- Server staff with `MANAGE_TEAMS` can invite an approved team.
- Team OWNER/MANAGER can approve or deny the incoming invitation.
- Other team members cannot decide it.

### Revocation and multiples

- Team OWNER/MANAGER can revoke an approved affiliation.
- Server staff with `MANAGE_TEAMS` can revoke an approved affiliation.
- A team can be approved for multiple servers at the same time.
- A denied/revoked relationship can later be requested again.
- Duplicate PENDING or APPROVED requests are rejected instead of creating duplicate rows.
- Only approved team and server profiles can enter affiliation flows.

## Protected Roblox private server

- Team OWNER can configure a valid Roblox private-server invite/share link.
- Team MANAGER can configure it.
- Team CAPTAIN can configure it.
- Player/Substitute/Coach cannot edit it.
- Every ACTIVE team member can see the Join button in the authenticated identity dashboard.
- A non-member cannot obtain the link from public team pages, server pages, search, or spectator pages.
- A normal Roblox game page without a private-server invite code is rejected.
- A non-Roblox URL is rejected.
- Clearing the field removes the private-server link.
- Private-server link values are never included in public team-card/profile queries.

## Existing behavior regressions

- Team invitations/applications/roster management still work.
- Team settings still work.
- Server profile editing and workspace access management still work.
- Event creation, event access, brackets, Match Center, spectator views, PNG export, and v0.9.3 rich descriptions still work.
- Calendar export remains title + start time only.
- v0.9.4 event archive filters and bracket polish remain intact.

## Release verification

Before merge run **Local release verification** on:

```text
feature/v0.9.5-teams-server-identity
```

After merge run it again on:

```text
main
```

Expected final artifact:

```text
C:\GameNightToolsRelease\gamenight-tools-v0.9.5-directadmin.zip
```
