import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
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

  // RLS limits the regular client to the caller's own row — use the
  // service-role client here so an admin can see every coach's base salary.
  const admin = createAdminClient();
  const { data: allCoaches } = await admin.from("coach").select("name, base_salary_cents");
  const baseSalaryByName: Record<string, number> = {};
  for (const c of allCoaches ?? []) {
    baseSalaryByName[c.name.toLowerCase()] = c.base_salary_cents ?? 0;
  }

  try {
    if (!coach.is_admin) {
      // Regular coaches only ever see their own roster, regardless of query params.
      const clients = await getClientsForCoach(coach.name);
      return NextResponse.json({
        clients,
        isAdmin: false,
        baseSalaryCents: baseSalaryByName[coach.name.toLowerCase()] ?? 0,
      });
    }

    if (viewAs && viewAs !== "__all__") {
      const clients = await getClientsForCoach(viewAs);
      return NextResponse.json({
        clients,
        isAdmin: true,
        coachNames: await getDistinctCoachNames(),
        baseSalaryCents: baseSalaryByName[viewAs.toLowerCase()] ?? 0,
      });
    }

    const clients = await getAllClients();
    const totalBaseSalaryCents = Object.values(baseSalaryByName).reduce((sum, c) => sum + c, 0);
    return NextResponse.json({
      clients,
      isAdmin: true,
      coachNames: await getDistinctCoachNames(),
      baseSalaryCents: totalBaseSalaryCents,
    });
  } catch {
    return NextResponse.json({ error: "Couldn't load the roster." }, { status: 502 });
  }
}
