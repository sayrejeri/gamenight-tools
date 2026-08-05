import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { readSession } from "@/lib/auth";
import { getPool } from "@/lib/db";
import { canManageSuggestions, getPlatformRole } from "@/lib/platform-access";

const statusSchema = z.object({
  status: z.enum(["NEW", "UNDER_REVIEW", "NEEDS_INFO", "PLANNED", "IN_DEVELOPMENT", "RELEASED", "DECLINED", "DUPLICATE"]),
  staffNote: z.string().max(1000).optional().default(""),
  locked: z.boolean().optional().default(false),
});

export async function PATCH(request: NextRequest, context: { params: Promise<{ suggestionId: string }> }) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const role = await getPlatformRole(session.userId);
  if (!canManageSuggestions(role)) return NextResponse.json({ error: "Platform staff access is required." }, { status: 403 });
  const parsed = statusSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid suggestion status." }, { status: 400 });
  const { suggestionId } = await context.params;

  await getPool().execute(
    `UPDATE suggestions SET status = ?, staff_note = ?, is_locked = ?, updated_at = CURRENT_TIMESTAMP(3)
     WHERE id = ?`,
    [parsed.data.status, parsed.data.staffNote.trim() || null, parsed.data.locked ? 1 : 0, suggestionId],
  );
  return NextResponse.json({ success: true });
}
