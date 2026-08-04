import { NextRequest, NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import { z } from "zod";
import { readSession } from "@/lib/auth";
import { getPool, query } from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";

const responseSchema = z.object({ decision: z.enum(["ACCEPTED", "DECLINED"]) });

type InvitationRow = RowDataPacket & {
  event_id: string;
  workspace_id: string;
  invited_discord_id: string;
  status: string;
  expires_at: Date | null;
};

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ invitationId: string }> },
) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const { invitationId } = await context.params;
  const parsed = responseSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid response." }, { status: 400 });

  const rows = await query<InvitationRow[]>(
    `SELECT ec.event_id, e.workspace_id, ec.invited_discord_id, ec.status, ec.expires_at
     FROM event_cohosts ec
     INNER JOIN events e ON e.id = ec.event_id
     WHERE ec.id = ? LIMIT 1`,
    [invitationId],
  );
  const invitation = rows[0];
  if (!invitation) return NextResponse.json({ error: "Invitation not found." }, { status: 404 });
  if (invitation.invited_discord_id !== session.discordId) {
    return NextResponse.json({ error: "This invitation belongs to another Discord account." }, { status: 403 });
  }
  if (invitation.status !== "PENDING") {
    return NextResponse.json({ error: "This invitation is no longer pending." }, { status: 400 });
  }
  if (invitation.expires_at && new Date(invitation.expires_at).getTime() <= Date.now()) {
    await getPool().execute(`UPDATE event_cohosts SET status = 'EXPIRED' WHERE id = ?`, [invitationId]);
    return NextResponse.json({ error: "This invitation has expired." }, { status: 400 });
  }

  await getPool().execute(
    `UPDATE event_cohosts
     SET status = ?, invited_user_id = ?, responded_at = CURRENT_TIMESTAMP(3)
     WHERE id = ?`,
    [parsed.data.decision, session.userId, invitationId],
  );

  await writeAuditLog({
    actorUserId: session.userId,
    workspaceId: invitation.workspace_id,
    eventId: invitation.event_id,
    action: `event.cohost_${parsed.data.decision.toLowerCase()}`,
    targetType: "cohost_invitation",
    targetId: invitationId,
  });

  return NextResponse.json({ success: true });
}
