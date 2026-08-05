import { NextRequest, NextResponse } from "next/server";
import { readSession } from "@/lib/auth";
import { resolveRobloxGame } from "@/lib/roblox";

export async function GET(request: NextRequest) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const value = request.nextUrl.searchParams.get("value") ?? "";
  if (!value.trim()) return NextResponse.json({ error: "Enter a Roblox game link or Place ID." }, { status: 400 });

  const game = await resolveRobloxGame(value);
  if (!game) {
    return NextResponse.json(
      { error: "That Roblox experience could not be found. Check the game link or Place ID." },
      { status: 404 },
    );
  }

  return NextResponse.json({ game });
}
