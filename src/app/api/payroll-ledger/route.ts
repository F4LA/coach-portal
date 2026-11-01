// Payroll -> Ledger writer for strongstandard.com/tools/payroll (GitHub Pages).
// When a slip is approved, the page sends its numbers here and we upsert one row
// per (Period, Person) in the "Ledger" tab of the "Strong Standard Payroll" sheet.
// When a slip is un-approved, the row is cleared.
// Only @strongstandard.com accounts. Writes only to PAYROLL_SHEET (allow-listed).

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getValuesRW, updateValues, appendValues } from "@/lib/googleSheets";

export const maxDuration = 30;

const PAYROLL_SHEET = "133Md4lY1fZeNCNQ5PGLy62y4NbZsObmXvvtrzBvXgJo"; // Strong Standard Payroll
const LEDGER = "Ledger";
const ALLOWED_ORIGINS = new Set(["https://strongstandard.com", "https://www.strongstandard.com"]);
const COMPANY_DOMAIN = "@strongstandard.com";
const ROLES = new Set(["Coach", "Closer", "Setter", "Admin"]);

function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("origin") || "";
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "600",
    "Cache-Control": "no-store",
    Vary: "Origin",
  };
  if (ALLOWED_ORIGINS.has(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

async function checkUser(request: Request): Promise<{ email?: string; status?: number; error?: string }> {
  const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return { status: 401, error: "Not signed in." };
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
  const { data, error } = await supabase.auth.getUser(token);
  const email = (data?.user?.email || "").toLowerCase();
  if (error || !email) return { status: 401, error: "Session expired. Please sign in again." };
  if (!email.endsWith(COMPANY_DOMAIN)) return { status: 403, error: "Only @strongstandard.com accounts can use this." };
  return { email };
}

export async function OPTIONS(request: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request) });
}

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
};
const str = (v: unknown, max = 500) => String(v ?? "").replace(/[\r\n\t]+/g, " ").trim().slice(0, max);
// Never let user text be read as a formula.
const safeText = (v: unknown, max = 500) => {
  const t = str(v, max);
  return /^[=+\-@]/.test(t) ? "'" + t : t;
};

// GET ?period=YYYY-MM -> ledger rows for that period (for the page's checks).
export async function GET(request: Request) {
  const headers = corsHeaders(request);
  const user = await checkUser(request);
  if (!user.email) return NextResponse.json({ error: user.error }, { status: user.status, headers });
  const period = new URL(request.url).searchParams.get("period") || "";
  try {
    const rows = await getValuesRW(PAYROLL_SHEET, `${LEDGER}!A2:N`);
    const out = rows.filter((r) => !period || r[0] === period);
    return NextResponse.json({ rows: out }, { headers });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Couldn't read the ledger." }, { status: 502, headers });
  }
}

export async function POST(request: Request) {
  const headers = corsHeaders(request);
  const fail = (status: number, error: string) => NextResponse.json({ error }, { status, headers });
  const user = await checkUser(request);
  if (!user.email) return fail(user.status || 401, user.error || "Not signed in.");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let b: any;
  try { b = await request.json(); } catch { return fail(400, "Invalid JSON."); }

  const period = str(b.period, 7);
  const person = safeText(b.person, 80);
  const role = str(b.role, 20);
  if (!/^\d{4}-\d{2}$/.test(period)) return fail(400, "Period must be YYYY-MM.");
  if (!person) return fail(400, "Missing person.");
  if (!ROLES.has(role)) return fail(400, "Invalid role.");
  const key = `${period}|${role}|${person}`;

  try {
    const rows = await getValuesRW(PAYROLL_SHEET, `${LEDGER}!A2:N`);
    const idx = rows.findIndex((r) => (r[13] || "") === key);
    const rowNum = idx >= 0 ? idx + 2 : null;

    if (b.action === "unapprove") {
      if (rowNum) await updateValues(PAYROLL_SHEET, `${LEDGER}!A${rowNum}:N${rowNum}`, [Array(14).fill("")]);
      return NextResponse.json({ ok: true, cleared: !!rowNum }, { headers });
    }

    const base = num(b.base), commission = num(b.commission), retention = num(b.retention), extras = num(b.extras), total = num(b.total);
    const row = (n: number | null) => [
      period,
      str(b.payDate, 10),
      person,
      role,
      base,
      commission,
      retention,
      extras,
      safeText(b.extrasDetail, 1000),
      total,
      n ? `=ROUND(J${n}-SUM(E${n}:H${n}),2)` : "=ROUND(INDIRECT(\"J\"&ROW())-SUM(INDIRECT(\"E\"&ROW()&\":H\"&ROW())),2)",
      new Date().toISOString().replace("T", " ").slice(0, 16) + " UTC",
      user.email,
      key,
    ];
    if (rowNum) await updateValues(PAYROLL_SHEET, `${LEDGER}!A${rowNum}:N${rowNum}`, [row(rowNum)]);
    else await appendValues(PAYROLL_SHEET, `${LEDGER}!A1:N1`, [row(null)]);
    return NextResponse.json({ ok: true, updated: !!rowNum }, { headers });
  } catch (err) {
    return fail(502, err instanceof Error ? err.message : "Couldn't write to the ledger.");
  }
}
