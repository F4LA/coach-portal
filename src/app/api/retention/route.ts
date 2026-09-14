import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAllClients, getClientsForCoach, getDistinctCoachNames } from "@/lib/mastersheet";
import { getRetentionRows, mergeRetention, upsertRetention, RETENTION_STATUSES } from "@/lib/retention";
import type { RetentionStatus } from "@/lib/retention";

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
    const [rawClients, rows] = await Promise.all([
      !coach.is_admin
        ? getClientsForCoach(coach.name)
        : viewAs && viewAs !== "__all__"
          ? getClientsForCoach(viewAs)
          : getAllClients(),
      getRetentionRows(),
    ]);

    const clients = mergeRetention(rawClients, rows)
      .filter((c) => !c.isRefunded)
      .sort((a, b) => (a.contractEnd < b.contractEnd ? -1 : a.contractEnd > b.contractEnd ? 1 : 0));

    return NextResponse.json({
      clients,
      isAdmin: coach.is_admin,
      coachNames: coach.is_admin ? await getDistinctCoachNames() : undefined,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Couldn't load retention data." }, { status: 502 });
  }
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const { data: coach } = await supabase.from("coach").select("name, is_admin").eq("id", user.id).maybeSingle();
  if (!coach) {
    return NextResponse.json({ error: "No coach profile found." }, { status: 404 });
  }

  const body = await request.json();
  const { firstName, lastName, email, contractStart, contractEnd, coachName, retentionStatus, retentionProgram, retentionNotes } = body ?? {};

  if (!email || !contractStart || !coachName) {
    return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
  }
  if (!coach.is_admin && coachName.trim().toLowerCase() !== coach.name.trim().toLowerCase()) {
    return NextResponse.json({ error: "You can only update your own clients." }, { status: 403 });
  }
  if (retentionStatus && !RETENTION_STATUSES.includes(retentionStatus as (typeof RETENTION_STATUSES)[number])) {
    return NextResponse.json({ error: "Invalid retention status." }, { status: 400 });
  }

  try {
    await upsertRetention({
      firstName: firstName ?? "",
      lastName: lastName ?? "",
      email,
      contractStart,
      contractEnd: contractEnd ?? "",
      coachName,
      retentionStatus: (retentionStatus ?? "") as RetentionStatus,
      retentionProgram: retentionProgram ?? "",
      retentionNotes: retentionNotes ?? "",
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Couldn't save." }, { status: 502 });
  }
}
