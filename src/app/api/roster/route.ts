import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getClientsForCoach } from "@/lib/mastersheet";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const { data: coach } = await supabase.from("coach").select("name").eq("id", user.id).maybeSingle();
  if (!coach) {
    return NextResponse.json({ error: "No coach profile found." }, { status: 404 });
  }

  try {
    const clients = await getClientsForCoach(coach.name);
    return NextResponse.json({ clients });
  } catch {
    return NextResponse.json({ error: "Couldn't load the roster." }, { status: 502 });
  }
}
