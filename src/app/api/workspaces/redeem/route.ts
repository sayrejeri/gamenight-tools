import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import { z } from "zod";
import { readSession } from "@/lib/auth";
import { hashInviteCode } from "@/lib/codes";
import { withTransaction } from "@/lib/db";

const redeemSchema = z.object({ code: z.string().trim().min(5).max(40) });

type CodeRow = RowDataPacket & {
  id: string;
  workspace_id: string;
  target_event_id: string | null;
  code_type: "STAFF" | "HOST" | "EVENT";
  grant_role: "ADMIN" | "STAFF" | "HOST" | "REFEREE" | "VIEWER" | null;
  max_uses: number | null;
  use_count: number;
  expires_at: Date | null;
  is_active: number;
};

export async function POST(request: NextRequest) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const parsed = redeemSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid code." }, { status: 400 });

  try {
    const result = await withTransaction(async (connection) => {
      const [rows] = await connection.query<CodeRow[]>(
        `SELECT * FROM invite_codes WHERE code_hash = ? FOR UPDATE`,
        [hashInviteCode(parsed.data.code)],
      );
      const code = rows[0];
      if (!code || !code.is_active) throw new Error("INVALID_CODE");
      if (code.expires_at && new Date(code.expires_at).getTime() <= Date.now()) throw new Error("EXPIRED_CODE");
      if (code.max_uses !== null && code.use_count >= code.max_uses) throw new Error("USED_CODE");

      const [existingRedemption] = await connection.query<RowDataPacket[]>(
        `SELECT id FROM invite_code_redemptions WHERE invite_code_id = ? AND user_id = ? LIMIT 1`,
        [code.id, session.userId],
      );
      if (existingRedemption[0]) throw new Error("ALREADY_REDEEMED");

      if (code.code_type === "EVENT") {
        if (!code.target_event_id) throw new Error("INVALID_CODE");
        await connection.execute(
          `INSERT INTO event_participants (event_id, user_id, status)
           VALUES (?, ?, 'PENDING')
           ON DUPLICATE KEY UPDATE status = IF(status = 'WITHDRAWN', 'PENDING', status)`,
          [code.target_event_id, session.userId],
        );
      } else {
        const role = code.grant_role ?? (code.code_type === "STAFF" ? "STAFF" : "HOST");
        await connection.execute(
          `INSERT INTO workspace_members (workspace_id, user_id, role, status, approved_by)
           VALUES (?, ?, ?, 'ACTIVE', NULL)
           ON DUPLICATE KEY UPDATE role = VALUES(role), status = 'ACTIVE'`,
          [code.workspace_id, session.userId, role],
        );
      }

      await connection.execute(
        `INSERT INTO invite_code_redemptions (id, invite_code_id, user_id) VALUES (?, ?, ?)`,
        [randomUUID(), code.id, session.userId],
      );
      await connection.execute(
        `UPDATE invite_codes SET use_count = use_count + 1 WHERE id = ?`,
        [code.id],
      );

      return {
        type: code.code_type,
        workspaceId: code.workspace_id,
        eventId: code.target_event_id,
      };
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const friendly: Record<string, string> = {
      INVALID_CODE: "That code is invalid or has been disabled.",
      EXPIRED_CODE: "That code has expired.",
      USED_CODE: "That code has reached its maximum number of uses.",
      ALREADY_REDEEMED: "You have already redeemed that code.",
    };
    return NextResponse.json({ error: friendly[message] ?? "The code could not be redeemed." }, { status: 400 });
  }
}
