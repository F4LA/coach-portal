import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAllClients, getClientsForCoach, getDistinctCoachNames } from "@/lib/mastersheet";

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const { data: coach } = await supabase.from("coach").select("name, is_admin").eq("id", user.id).maybeSingle();
  if (!coach) {
    return NextResponse.json({ error: "No coach profile found." }, { status: 404 });
  }

  const params = new URL(request.url).searchParams;
  const viewAs = params.get("coach");

  try {
    if (!coach.is_admin) {
      // Regular coaches only ever see their own roster, regardless of query params.
      const clients = await getClientsForCoach(coach.name);
      return NextResponse.json({ clients, isAdmin: false });
    }

    if (viewAs && viewAs !== "__all__") {
      const clients = await getClientsForCoach(viewAs);
      return NextResponse.json({ clients, isAdmin: true, coachNames: await getDistinctCoachNames() });
    }

    const clients = await getAllClients();
    return NextResponse.json({ clients, isAdmin: true, coachNames: await getDistinctCoachNames() });
  } catch {
    return NextResponse.json({ error: "Couldn't load the roster." }, { status: 502 });
  }
}
