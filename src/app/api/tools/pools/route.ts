import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import { z } from "zod";
import { readSession } from "@/lib/auth";
import { getPool, query, withTransaction } from "@/lib/db";

const itemSchema = z.object({
  label: z.string().trim().min(1).max(191),
  details: z.string().trim().max(255).optional().default(""),
});

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  poolType: z.enum(["GAME", "MAP", "MIXED"]),
  items: z.array(itemSchema).min(1).max(250),
});

const updateSchema = createSchema.extend({ id: z.string().uuid() });
const deleteSchema = z.object({ id: z.string().uuid() });

type PoolRow = RowDataPacket & {
  id: string;
  name: string;
  pool_type: "GAME" | "MAP" | "MIXED";
  created_at: Date;
  updated_at: Date;
};
type ItemRow = RowDataPacket & {
  id: string;
  pool_id: string;
  label: string;
  details: string | null;
  sort_order: number;
};

function normalizeItems(items: Array<{ label: string; details?: string }>) {
  const seen = new Set<string>();
  return items.flatMap((item) => {
    const label = item.label.trim();
    const key = label.toLocaleLowerCase();
    if (!label || seen.has(key)) return [];
    seen.add(key);
    return [{ label, details: item.details?.trim() || null }];
  });
}

export async function GET() {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const [pools, items] = await Promise.all([
    query<PoolRow[]>(
      `SELECT id, name, pool_type, created_at, updated_at
       FROM game_night_pools WHERE owner_user_id = ? ORDER BY updated_at DESC, name ASC`,
      [session.userId],
    ),
    query<ItemRow[]>(
      `SELECT i.id, i.pool_id, i.label, i.details, i.sort_order
       FROM game_night_pool_items i
       INNER JOIN game_night_pools p ON p.id = i.pool_id
       WHERE p.owner_user_id = ? AND i.is_active = 1
       ORDER BY i.pool_id, i.sort_order ASC, i.created_at ASC`,
      [session.userId],
    ),
  ]);

  const byPool = new Map<string, ItemRow[]>();
  for (const item of items) {
    const list = byPool.get(item.pool_id) ?? [];
    list.push(item);
    byPool.set(item.pool_id, list);
  }

  return NextResponse.json({
    pools: pools.map((pool) => ({
      id: pool.id,
      name: pool.name,
      poolType: pool.pool_type,
      createdAt: new Date(pool.created_at).toISOString(),
      updatedAt: new Date(pool.updated_at).toISOString(),
      items: (byPool.get(pool.id) ?? []).map((item) => ({ id: item.id, label: item.label, details: item.details })),
    })),
  });
}

export async function POST(request: NextRequest) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a pool name and at least one valid item." }, { status: 400 });
  const items = normalizeItems(parsed.data.items);
  if (!items.length) return NextResponse.json({ error: "Add at least one unique pool item." }, { status: 400 });

  try {
    const id = randomUUID();
    await withTransaction(async (connection) => {
      await connection.execute(
        `INSERT INTO game_night_pools (id, owner_user_id, name, pool_type) VALUES (?, ?, ?, ?)`,
        [id, session.userId, parsed.data.name, parsed.data.poolType],
      );
      for (let index = 0; index < items.length; index += 1) {
        await connection.execute(
          `INSERT INTO game_night_pool_items (id, pool_id, label, details, sort_order) VALUES (?, ?, ?, ?, ?)`,
          [randomUUID(), id, items[index].label, items[index].details, index],
        );
      }
    });
    return NextResponse.json({ success: true, id });
  } catch (error) {
    if (error instanceof Error && /duplicate/i.test(error.message)) {
      return NextResponse.json({ error: "You already have a saved pool with that name." }, { status: 409 });
    }
    throw error;
  }
}

export async function PATCH(request: NextRequest) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid saved pool update." }, { status: 400 });
  const items = normalizeItems(parsed.data.items);
  if (!items.length) return NextResponse.json({ error: "Add at least one unique pool item." }, { status: 400 });

  try {
    const changed = await withTransaction(async (connection) => {
      const [rows] = await connection.query<(RowDataPacket & { id: string })[]>(
        `SELECT id FROM game_night_pools WHERE id = ? AND owner_user_id = ? LIMIT 1 FOR UPDATE`,
        [parsed.data.id, session.userId],
      );
      if (!rows[0]) return false;
      await connection.execute(
        `UPDATE game_night_pools SET name = ?, pool_type = ?, updated_at = CURRENT_TIMESTAMP(3) WHERE id = ?`,
        [parsed.data.name, parsed.data.poolType, parsed.data.id],
      );
      await connection.execute(`DELETE FROM game_night_pool_items WHERE pool_id = ?`, [parsed.data.id]);
      for (let index = 0; index < items.length; index += 1) {
        await connection.execute(
          `INSERT INTO game_night_pool_items (id, pool_id, label, details, sort_order) VALUES (?, ?, ?, ?, ?)`,
          [randomUUID(), parsed.data.id, items[index].label, items[index].details, index],
        );
      }
      return true;
    });
    if (!changed) return NextResponse.json({ error: "Saved pool not found." }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && /duplicate/i.test(error.message)) {
      return NextResponse.json({ error: "You already have a saved pool with that name." }, { status: 409 });
    }
    throw error;
  }
}

export async function DELETE(request: NextRequest) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const parsed = deleteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid saved pool." }, { status: 400 });
  await getPool().execute(
    `DELETE FROM game_night_pools WHERE id = ? AND owner_user_id = ?`,
    [parsed.data.id, session.userId],
  );
  return NextResponse.json({ success: true });
}
