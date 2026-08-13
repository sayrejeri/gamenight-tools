import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { readSession } from "@/lib/auth";
import { withTransaction } from "@/lib/db";
import { canManageTeamPrivateServer, getActiveTeamRole, normalizeRobloxPrivateServerUrl } from "@/lib/team-access";
import { writeAuditLog } from "@/lib/audit";

const linkSchema = z.object({ url: z.string().trim().max(1000).default("") });

export async function PATCH(request: NextRequest, context: { params: Promise<{ teamId: string }> }) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { teamId } = await context.params;
  const role = await getActiveTeamRole(session.userId, teamId);
  if (!canManageTeamPrivateServer(role)) return NextResponse.json({ error: "Team Owner, Manager, or Captain access is required." }, { status: 403 });

  const parsed = linkSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid Roblox server link." }, { status: 400 });
  let normalized: string | null;
  try { normalized = normalizeRobloxPrivateServerUrl(parsed.data.url); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid Roblox server link." }, { status: 400 }); }

  await withTransaction(async (connection) => {
    await connection.execute(
      `UPDATE teams SET private_server_url = ?, updated_at = CURRENT_TIMESTAMP(3) WHERE id = ? AND profile_status = 'APPROVED'`,
      [normalized, teamId],
    );
  });
  await writeAuditLog({
    actorUserId: session.userId,
    action: normalized ? "team.private_server.updated" : "team.private_server.cleared",
    targetType: "team",
    targetId: teamId,
    details: { configured: Boolean(normalized) },
  });
  return NextResponse.json({ success: true, configured: Boolean(normalized) });
}
