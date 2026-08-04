import { NextRequest, NextResponse } from "next/server";
import { sessionCookieOptions } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const response = NextResponse.redirect(new URL("/", request.url), 303);
  const options = sessionCookieOptions();
  response.cookies.set(options.name, "", { ...options, maxAge: 0 });
  return response;
}
