import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { createDiscordAuthorizationUrl } from "@/lib/discord";

export async function GET() {
  const state = randomBytes(24).toString("base64url");
  const response = NextResponse.redirect(createDiscordAuthorizationUrl(state));

  response.cookies.set("discord_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 10,
  });

  return response;
}
