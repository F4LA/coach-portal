import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getDistinctCoachNames } from "@/lib/mastersheet";

// For a user already authenticated (e.g. via "Continue with Google") but
// with no coach row yet — unlike /api/signup, this never creates the auth
// user itself, only the coach profile for the current session.
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const { name } = await request.json();
  if (!name) {
    return NextResponse.json({ error: "Name is required." }, { status: 400 });
  }

  const knownNames = await getDistinctCoachNames();
  const match = knownNames.find((n) => n.toLowerCase() === name.trim().toLowerCase());
  if (!match) {
    return NextResponse.json(
      { error: "That name isn't in the mastersheet's Coach column — check the spelling." },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  const { data: existingProfile } = await admin.from("coach").select("id").eq("id", user.id).maybeSingle();
  if (existingProfile) {
    return NextResponse.json({ error: "You already have a coach profile." }, { status: 409 });
  }

  const { error } = await admin.from("coach").insert({ id: user.id, name: match });
  if (error) {
    return NextResponse.json({ error: "Couldn't create your coach profile." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
