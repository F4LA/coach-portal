// Public Supabase settings for the strongstandard.com/tools/* login screen.
// Both values are public by design (they already ship in this app's browser
// bundle); serving them here keeps the tools in sync with this project.

import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(
    {
      url: process.env.NEXT_PUBLIC_SUPABASE_URL,
      anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    },
    {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=300",
      },
    }
  );
}
