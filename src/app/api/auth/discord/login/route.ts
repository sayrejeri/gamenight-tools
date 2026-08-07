import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createDiscordAuthorizationUrl } from "@/lib/discord";

function safeReturnTo(value: string | null): string | null {
  if (!value) return null;
  if (value === "/dashboard" || value.startsWith("/dashboard/")) return value;
  return null;
}

export async function GET(request: NextRequest) {
  const state = randomBytes(24).toString("base64url");
  const response = NextResponse.redirect(createDiscordAuthorizationUrl(state));
  const returnTo = safeReturnTo(request.nextUrl.searchParams.get("returnTo"));

  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 60 * 10,
  };

  response.cookies.set("discord_oauth_state", state, cookieOptions);
  if (returnTo) response.cookies.set("discord_oauth_return_to", returnTo, cookieOptions);
  else response.cookies.delete("discord_oauth_return_to");

  return response;
}
