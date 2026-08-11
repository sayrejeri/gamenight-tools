# Game Night Tools v0.9.1 — Security, Privacy & Tournament Integrity Hotfix

v0.9.1 is a hardening release after the v0.9 competitive-profile launch. It combines the unresolved release-review findings that are still applicable to the current codebase instead of shipping several separate hotfixes.

## Competitive privacy and leaderboards

- Restrict leaderboard data to servers/events the signed-in viewer is allowed to see.
- Reject manually supplied workspace filters outside the viewer's available servers.
- Keep restricted event names, games, workspaces, and opponents out of public competitive profiles.
- Redact hidden/private opponents instead of exposing their identity through another player's match history.
- Exclude suspended/banned accounts and users blocked in either direction from player rankings.
- Count recorded matches from unique source matches instead of halving visible player/team rows.
- Push competitive-profile filtering toward scoped database queries so public profiles do not repeatedly materialize the full competitive dataset.

## Event access/privacy hardening

- Apply event visibility rules to individual signup requests.
- Apply event visibility rules to calendar/ICS downloads.
- Prevent draft/restricted events from leaking through general event lists.
- Apply event visibility rules to public profile event history.
- Harden user lookup so private/non-discoverable/inactive accounts cannot be enumerated and wildcard input cannot broaden searches unexpectedly.

## Tournament integrity

- Prevent normalized matches from reusing one database row when competition shape changes.
- Freeze team entrant/roster snapshot mutations once a competition has been generated or published.
- Prevent LIVE/COMPLETED competitions from being downgraded into editable GENERATED state.
- Preserve old reports/disputes as voided/resolved evidence when upstream corrections invalidate downstream matches instead of deleting them.
- Keep match mutations and their required audit records as close to one atomic transaction as supported by the existing database layer.

## Access-control hardening

- Resolve numeric Discord IDs with explicit precedence and reject ambiguous username matches before granting server access.
- Only team owners may grant MANAGER through application approval.

## Spectator links

- Fix the remaining parent-layout gate so valid enabled/unexpired links can show safe pre-live, postponed, and cancelled status pages instead of a generic 404.
- Invalid, revoked, and expired tokens still 404.
- Competition results remain visible only when the spectator page determines the event and bracket are public-ready.

## Database

- No migration is required.
- Do not rerun migrations 001–009.
- Expected database count remains 48 base tables.
