import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { readSession } from "@/lib/auth";
import { getPool } from "@/lib/db";
import { hasPlatformPermission } from "@/lib/permissions";
import { writeAuditLog } from "@/lib/audit";

const reviewSchema = z.object({
  status: z.enum(["UNDER_REVIEW", "RESOLVED", "DISMISSED"]),
  resolutionNote: z.string().trim().max(1000).optional().default(""),
});

export async function PATCH(request: NextRequest, context: { params: Promise<{ reportId: string }> }) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!(await hasPlatformPermission(session.userId, "MODERATE_USERS"))) return NextResponse.json({ error: "User-moderation permission is required." }, { status: 403 });
  const parsed = reviewSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid report status." }, { status: 400 });
  const { reportId } = await context.params;
  const resolved = ["RESOLVED", "DISMISSED"].includes(parsed.data.status);
  await getPool().execute(
    `UPDATE reports SET status = ?, assigned_to = COALESCE(assigned_to, ?), resolved_by = ?, resolution_note = ?, resolved_at = ? WHERE id = ?`,
    [parsed.data.status, session.userId, resolved ? session.userId : null, parsed.data.resolutionNote || null, resolved ? new Date() : null, reportId],
  );
  await writeAuditLog({ actorUserId: session.userId, action: `report.${parsed.data.status.toLowerCase()}`, targetType: "report", targetId: reportId, severity: "MODERATION", details: { note: parsed.data.resolutionNote } });
  return NextResponse.json({ success: true });
}
