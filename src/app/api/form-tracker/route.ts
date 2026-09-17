import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getFormTrackerWeek, INCLUDED_COACHES } from "@/lib/formTracker";
import { weekKeyFor } from "@/lib/weekWindow";

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
  const weekKey = params.get("week") || weekKeyFor(new Date());
  const viewAs = params.get("coach");

  try {
    const data = await getFormTrackerWeek(weekKey);

    const scopedCoach = !coach.is_admin ? coach.name : viewAs && viewAs !== "__all__" ? viewAs : null;
    const clients = scopedCoach
      ? data.clients.filter((c) => c.coachName.toLowerCase() === scopedCoach.trim().toLowerCase())
      : data.clients;

    return NextResponse.json({
      window: data.window,
      closed: data.closed,
      clients,
      unmatchedFormClientCount: data.unmatchedFormClientCount,
      unmatchedFormClientSample: data.unmatchedFormClientSample,
      isAdmin: coach.is_admin,
      coachNames: coach.is_admin ? INCLUDED_COACHES : undefined,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Couldn't load the form tracker." }, { status: 502 });
  }
}
