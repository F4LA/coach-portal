import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getDistinctCoachNames } from "@/lib/mastersheet";

export async function POST(request: Request) {
  const { name, email, password } = await request.json();

  if (!name || !email || !password) {
    return NextResponse.json({ error: "All fields are required." }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
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

  const { data: userData, error: userError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (userError || !userData.user) {
    const message = userError?.message?.includes("already been registered")
      ? "An account with that email already exists."
      : "Couldn't create the account.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const { error: coachError } = await admin.from("coach").insert({
    id: userData.user.id,
    name: match,
  });

  if (coachError) {
    await admin.auth.admin.deleteUser(userData.user.id);
    return NextResponse.json({ error: "Couldn't create the coach profile." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
