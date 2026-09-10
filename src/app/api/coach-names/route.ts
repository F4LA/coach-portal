import { NextResponse } from "next/server";
import { getDistinctCoachNames } from "@/lib/mastersheet";

export async function GET() {
  try {
    const names = await getDistinctCoachNames();
    return NextResponse.json({ names });
  } catch {
    return NextResponse.json({ error: "Couldn't load coach names." }, { status: 502 });
  }
}
