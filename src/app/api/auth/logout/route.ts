import { NextRequest, NextResponse } from "next/server";
import { sessionCookieOptions } from "@/lib/auth";

function appUrl(request: NextRequest): URL {
  const baseUrl = process.env.APP_URL ?? request.nextUrl.origin;
  return new URL("/", baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
}

export async function POST(request: NextRequest) {
  const response = NextResponse.redirect(appUrl(request), 303);
  const options = sessionCookieOptions();
  response.cookies.set(options.name, "", { ...options, maxAge: 0 });
  response.cookies.delete("discord_oauth_state");
  response.cookies.delete("discord_oauth_return_to");
  return response;
}
