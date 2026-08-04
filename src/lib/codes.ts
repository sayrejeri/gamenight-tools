import { createHash, randomBytes } from "node:crypto";

export function normalizeInviteCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function generateInviteCode(prefix: "STAFF" | "HOST" | "GN"): string {
  const raw = randomBytes(6).toString("base64url").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
  return `${prefix}-${raw.slice(0, 4)}-${raw.slice(4, 8)}`;
}

export function hashInviteCode(code: string): string {
  const pepper = process.env.CODE_PEPPER ?? process.env.AUTH_SECRET ?? "";
  return createHash("sha256").update(`${normalizeInviteCode(code)}:${pepper}`).digest("hex");
}
