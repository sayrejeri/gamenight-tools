import Link from "next/link";
import type { RowDataPacket } from "mysql2";
import { requireSession } from "@/lib/auth";
import { query } from "@/lib/db";
import { hasWorkspacePermission } from "@/lib/permissions";
import { getPlatformRole } from "@/lib/platform-access";
import { isServerProfileApprovalRequired } from "@/lib/platform-settings";
import { canManageTeamIdentity, canManageTeamPrivateServer, type TeamRole } from "@/lib/team-access";
import { PlatformProfileApprovalSettings } from "@/components/platform-profile-approval-settings";
import {
  TeamAffiliationManager,
  TeamPrivateServerCard,
  WorkspaceTeamAffiliationManager,
  type IdentityAffiliation,
} from "@/components/team-server-identity-controls";

type TeamRow = RowDataPacket & { id: string; name: string; slug: string; role: TeamRole; private_server_url: string | null };
type WorkspaceRow = RowDataPacket & { id: string; name: string; role: string | null };
type OptionRow = RowDataPacket & { id: string; name: string; slug?: string };
type AffiliationRow = RowDataPacket & {
  team_id: string;
  team_name: string;
  team_slug: string;
  workspace_id: string;
  workspace_name: string;
  status: "PENDING" | "APPROVED" | "DENIED" | "REVOKED";
  initiated_by_scope: "TEAM" | "WORKSPACE";
};

export const dynamic = "force-dynamic";

function toAffiliation(row: AffiliationRow): IdentityAffiliation {
  return {
    teamId: row.team_id,
    teamName: row.team_name,
    teamSlug: row.team_slug,
    workspaceId: row.workspace_id,
    workspaceName: row.workspace_name,
    status: row.status,
    initiatedBy: row.initiated_by_scope,
  };
}

export default async function TeamServerIdentityPage() {
  const session = await requireSession();
  const platformRole = await getPlatformRole(session.userId);

  const [teams, memberWorkspaces, allWorkspaceOptions, allTeamOptions] = await Promise.all([
    query<TeamRow[]>(
      `SELECT t.id, t.name, t.slug, tm.role, t.private_server_url
       FROM team_members tm INNER JOIN teams t ON t.id = tm.team_id
       WHERE tm.user_id = ? AND tm.status = 'ACTIVE' AND t.profile_status = 'APPROVED'
       ORDER BY t.name`,
      [session.userId],
    ),
    platformRole === "OWNER" || platformRole === "ADMIN"
      ? query<WorkspaceRow[]>(`SELECT id, name, NULL AS role FROM workspaces WHERE profile_status = 'APPROVED' ORDER BY name LIMIT 250`)
      : query<WorkspaceRow[]>(
          `SELECT w.id, w.name, wm.role
           FROM workspace_members wm INNER JOIN workspaces w ON w.id = wm.workspace_id
           WHERE wm.user_id = ? AND wm.status = 'ACTIVE' AND w.profile_status = 'APPROVED'
           ORDER BY w.name`,
          [session.userId],
        ),
    query<OptionRow[]>(`SELECT id, name FROM workspaces WHERE profile_status = 'APPROVED' ORDER BY name LIMIT 250`),
    query<OptionRow[]>(`SELECT id, name, slug FROM teams WHERE profile_status = 'APPROVED' ORDER BY name LIMIT 250`),
  ]);

  const permissionChecks = await Promise.all(memberWorkspaces.map(async (workspace) => ({
    workspace,
    canManage: await hasWorkspacePermission(session.userId, workspace.id, "MANAGE_TEAMS"),
  })));
  const managedWorkspaces = permissionChecks.filter((item) => item.canManage).map((item) => item.workspace);
  const managedWorkspaceIds = new Set(managedWorkspaces.map((workspace) => workspace.id));

  const [teamAffiliationRows, workspaceAffiliationRows, approvalRequired] = await Promise.all([
    teams.length ? query<AffiliationRow[]>(
      `SELECT a.team_id, t.name AS team_name, t.slug AS team_slug, a.workspace_id, w.name AS workspace_name,
              a.status, a.initiated_by_scope
       FROM team_workspace_affiliations a
       INNER JOIN teams t ON t.id = a.team_id
       INNER JOIN workspaces w ON w.id = a.workspace_id
       INNER JOIN team_members tm ON tm.team_id = a.team_id AND tm.user_id = ? AND tm.status = 'ACTIVE'
       ORDER BY w.name`,
      [session.userId],
    ) : Promise.resolve([] as AffiliationRow[]),
    managedWorkspaces.length ? query<AffiliationRow[]>(
      `SELECT a.team_id, t.name AS team_name, t.slug AS team_slug, a.workspace_id, w.name AS workspace_name,
              a.status, a.initiated_by_scope
       FROM team_workspace_affiliations a
       INNER JOIN teams t ON t.id = a.team_id
       INNER JOIN workspaces w ON w.id = a.workspace_id
       WHERE EXISTS (
         SELECT 1 FROM workspace_members wm
         WHERE wm.workspace_id = a.workspace_id AND wm.user_id = ? AND wm.status = 'ACTIVE'
       ) OR ? = 1
       ORDER BY t.name`,
      [session.userId, platformRole === "OWNER" || platformRole === "ADMIN" ? 1 : 0],
    ) : Promise.resolve([] as AffiliationRow[]),
    platformRole === "OWNER" ? isServerProfileApprovalRequired() : Promise.resolve(true),
  ]);

  const affiliationMap = new Map<string, IdentityAffiliation>();
  for (const row of [...teamAffiliationRows, ...workspaceAffiliationRows]) {
    if (teamAffiliationRows.includes(row) || managedWorkspaceIds.has(row.workspace_id)) {
      affiliationMap.set(`${row.team_id}:${row.workspace_id}`, toAffiliation(row));
    }
  }
  const affiliations = [...affiliationMap.values()];
  const workspaceOptions = allWorkspaceOptions.map((item) => ({ id: item.id, name: item.name }));
  const teamOptions = allTeamOptions.map((item) => ({ id: item.id, name: item.name, slug: item.slug }));

  return (
    <div className="section-stack">
      <section className="page-heading">
        <div><span className="eyebrow">v0.9.5 identity controls</span><h1>Teams &amp; server identity</h1><p>Keep Game Night Tools approval separate from each server's approval, manage official team/server relationships, and give accepted team members a protected Roblox private-server link.</p></div>
        <div className="button-row"><Link className="button button-secondary" href="/dashboard/teams">Teams</Link><Link className="button button-secondary" href="/dashboard/servers">Servers</Link><Link className="button" href="/dashboard/profile-requests">Profile requests</Link></div>
      </section>

      {platformRole === "OWNER" ? <PlatformProfileApprovalSettings required={approvalRequired} /> : null}

      <section className="panel section-stack">
        <div className="section-header"><div><h2>Your team identity</h2><p>Game Night Tools profile approval and server affiliation approval are intentionally separate.</p></div><span className="badge dashboard-count">{teams.length} teams</span></div>
        {teams.length ? <div className="section-stack">{teams.map((team) => {
          const teamAffiliations = affiliations.filter((item) => item.teamId === team.id);
          return <article className="subpanel section-stack" key={team.id}><div className="section-header"><div><span className="card-kicker">Your role: {team.role}</span><h3>{team.name}</h3></div><Link className="button button-secondary" href={`/teams/${team.slug}`}>Public team profile</Link></div><div className="dashboard-grid"><TeamAffiliationManager teamId={team.id} canManage={canManageTeamIdentity(team.role)} affiliations={teamAffiliations} workspaceOptions={workspaceOptions} /><TeamPrivateServerCard teamId={team.id} teamName={team.name} url={team.private_server_url} canEdit={canManageTeamPrivateServer(team.role)} /></div></article>;
        })}</div> : <div className="empty-state">Join or create an approved team to manage team identity.</div>}
      </section>

      <section className="panel section-stack">
        <div className="section-header"><div><h2>Servers you can manage teams for</h2><p>Teams can request approval from a server, or server staff with Manage Teams permission can invite an approved team.</p></div><span className="badge dashboard-count">{managedWorkspaces.length} servers</span></div>
        {managedWorkspaces.length ? <div className="dashboard-grid">{managedWorkspaces.map((workspace) => <WorkspaceTeamAffiliationManager key={workspace.id} workspaceId={workspace.id} workspaceName={workspace.name} affiliations={affiliations.filter((item) => item.workspaceId === workspace.id)} teamOptions={teamOptions} />)}</div> : <div className="empty-state">You do not currently have Manage Teams permission for an approved server profile.</div>}
      </section>

      <section className="rule-callout"><strong>What the badges mean</strong><p><b>Game Night Tools approved</b> means the team/server profile passed the platform profile process. <b>Approved for a server</b> means that specific server accepted the team affiliation. A team can be approved for multiple servers without changing its global profile approval.</p></section>
    </div>
  );
}
