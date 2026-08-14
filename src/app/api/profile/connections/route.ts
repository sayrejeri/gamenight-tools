import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import { z } from "zod";
import { readSession } from "@/lib/auth";
import { getPool, query } from "@/lib/db";
import { buildConnectionProfileUrl, normalizeConnectionType } from "@/lib/connections";
import { resolveRobloxUser } from "@/lib/roblox";

const addConnectionSchema = z.object({
  connectionType: z.string().trim().min(2).max(50),
  handle: z.string().trim().min(1).max(191),
  displayName: z.string().trim().max(191).nullable().optional(),
  visible: z.boolean().default(true),
});

const updateConnectionSchema = z.object({
  id: z.string().uuid(),
  handle: z.string().trim().min(1).max(191).optional(),
  displayName: z.string().trim().max(191).nullable().optional(),
  visible: z.boolean(),
});

type ExistingConnection = RowDataPacket & {
  source: "DISCORD" | "MANUAL";
  connection_type: string;
  external_id: string | null;
  profile_url: string | null;
  avatar_url: string | null;
};

type ConnectionSourceRow = RowDataPacket & { source: "DISCORD" | "MANUAL" };

async function enrichConnection(connectionType: string, handle: string) {
  const normalized = normalizeConnectionType(connectionType);

  if (normalized === "roblox") {
    const identity = await resolveRobloxUser(handle);
    if (identity) {
      return {
        handle: identity.username,
        displayName: identity.displayName,
        externalId: identity.id,
        profileUrl: identity.profileUrl,
        avatarUrl: identity.avatarUrl,
        verified: 1,
      };
    }
  }

  return {
    handle,
    displayName: null,
    externalId: null,
    profileUrl: buildConnectionProfileUrl(connectionType, null, handle),
    avatarUrl: null,
    verified: 0,
  };
}

export async function POST(request: NextRequest) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const parsed = addConnectionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid connection information." }, { status: 400 });

  const connectionType = parsed.data.connectionType.toLowerCase();
  const enriched = await enrichConnection(connectionType, parsed.data.handle);
  const id = randomUUID();

  await getPool().execute(
    `INSERT INTO user_connections
      (id, user_id, source, connection_type, external_id, handle, display_name,
       profile_url, avatar_url, is_verified, is_visible)
     VALUES (?, ?, 'MANUAL', ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      session.userId,
      connectionType,
      enriched.externalId,
      enriched.handle,
      parsed.data.displayName ?? enriched.displayName ?? enriched.handle,
      enriched.profileUrl,
      enriched.avatarUrl,
      enriched.verified,
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

  const existing = await query<ExistingConnection[]>(
    `SELECT source, connection_type, external_id, profile_url, avatar_url
     FROM user_connections WHERE id = ? AND user_id = ? LIMIT 1`,
    [parsed.data.id, session.userId],
  );
  if (!existing[0]) return NextResponse.json({ error: "Connection not found." }, { status: 404 });

  if (existing[0].source === "DISCORD") {
    await getPool().execute(
      `UPDATE user_connections
       SET is_visible = ?, updated_at = CURRENT_TIMESTAMP(3)
       WHERE id = ? AND user_id = ? AND source = 'DISCORD'`,
      [parsed.data.visible ? 1 : 0, parsed.data.id, session.userId],
    );
    return NextResponse.json({ success: true });
  }

  if (!parsed.data.handle) {
    return NextResponse.json({ error: "A username or handle is required for a manual identity." }, { status: 400 });
  }

  const enriched = await enrichConnection(existing[0].connection_type, parsed.data.handle);

  await getPool().execute(
    `UPDATE user_connections
     SET external_id = ?, handle = ?, display_name = ?, profile_url = ?, avatar_url = ?,
         is_verified = GREATEST(is_verified, ?), is_visible = ?, updated_at = CURRENT_TIMESTAMP(3)
     WHERE id = ? AND user_id = ?`,
    [
      enriched.externalId ?? existing[0].external_id,
      enriched.handle,
      parsed.data.displayName ?? enriched.displayName ?? enriched.handle,
      enriched.profileUrl ?? existing[0].profile_url,
      enriched.avatarUrl ?? existing[0].avatar_url,
      enriched.verified,
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

  const id = request.nextUrl.searchParams.get("id");
  if (!id || !z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: "A valid connection ID is required." }, { status: 400 });
  }

  const rows = await query<ConnectionSourceRow[]>(
    `SELECT source FROM user_connections WHERE id = ? AND user_id = ? LIMIT 1`,
    [id, session.userId],
  );
  if (!rows[0]) return NextResponse.json({ error: "Connection not found." }, { status: 404 });

  if (rows[0].source === "DISCORD") {
    // Keep a hidden tombstone so a later Discord refresh does not silently re-add an identity the user removed.
    await getPool().execute(
      `UPDATE user_connections SET is_visible = -1, updated_at = CURRENT_TIMESTAMP(3)
       WHERE id = ? AND user_id = ? AND source = 'DISCORD'`,
      [id, session.userId],
    );
  } else {
    await getPool().execute(
      `DELETE FROM user_connections WHERE id = ? AND user_id = ?`,
      [id, session.userId],
    );
  }

  return NextResponse.json({ success: true });
}
