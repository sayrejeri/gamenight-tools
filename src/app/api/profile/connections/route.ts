import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { readSession } from "@/lib/auth";
import { getPool } from "@/lib/db";

const addConnectionSchema = z.object({
  connectionType: z.string().trim().min(2).max(50),
  handle: z.string().trim().min(1).max(191),
  displayName: z.string().trim().max(191).nullable().optional(),
  visible: z.boolean().default(true),
});

const updateConnectionSchema = z.object({
  id: z.string().uuid(),
  handle: z.string().trim().min(1).max(191),
  displayName: z.string().trim().max(191).nullable().optional(),
  visible: z.boolean(),
});

export async function POST(request: NextRequest) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const parsed = addConnectionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid connection information." }, { status: 400 });

  const id = randomUUID();
  await getPool().execute(
    `INSERT INTO user_connections
      (id, user_id, source, connection_type, external_id, handle, display_name, is_verified, is_visible)
     VALUES (?, ?, 'MANUAL', ?, NULL, ?, ?, 0, ?)`,
    [
      id,
      session.userId,
      parsed.data.connectionType.toLowerCase(),
      parsed.data.handle,
      parsed.data.displayName ?? parsed.data.handle,
      parsed.data.visible ? 1 : 0,
    ],
  );

  return NextResponse.json({ id }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const parsed = updateConnectionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid connection update." }, { status: 400 });

  await getPool().execute(
    `UPDATE user_connections
     SET handle = ?, display_name = ?, is_visible = ?, updated_at = CURRENT_TIMESTAMP(3)
     WHERE id = ? AND user_id = ?`,
    [
      parsed.data.handle,
      parsed.data.displayName ?? parsed.data.handle,
      parsed.data.visible ? 1 : 0,
      parsed.data.id,
      session.userId,
    ],
  );

  return NextResponse.json({ success: true });
}

export async function DELETE(request: NextRequest) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const id = new URL(request.url).searchParams.get("id");
  if (!id || !z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: "A valid connection ID is required." }, { status: 400 });
  }

  await getPool().execute(
    `DELETE FROM user_connections WHERE id = ? AND user_id = ?`,
    [id, session.userId],
  );

  return NextResponse.json({ success: true });
}
