// Bridge for the internal tools on strongstandard.com/tools/* (GitHub Pages).
// The page signs in with Google through Supabase, sends its access token here,
// and gets back the rows of a PRIVATE sheet read with the service account.
// Only @strongstandard.com accounts and only the sheets listed below.

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getValues } from "@/lib/googleSheets";

const ALLOWED_ORIGINS = new Set([
  "https://strongstandard.com",
  "https://www.strongstandard.com",
]);

const COMPANY_DOMAIN = "@strongstandard.com";

const ALLOWED_SHEETS = new Set([
  "1ctM6K8hQfh73bi7f-MtXkqW3BaPxU73NZf8xPJQUEOc", // Client Mastersheet
  "1t19JjlIjliu1I5AEuxmDDM9EZQnKmkSFmZuk04c2foQ", // Closers sheet
  "1n5IXdQv4UDuag5X7QAK-7mM2EA7N3i0u5k0RONv0_BE", // Voucher
]);

function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("origin") || "";
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "600",
    "Cache-Control": "no-store",
    Vary: "Origin",
  };
  if (ALLOWED_ORIGINS.has(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

export async function OPTIONS(request: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request) });
}

export async function GET(request: Request) {
  const headers = corsHeaders(request);
  const fail = (status: number, error: string) => NextResponse.json({ error }, { status, headers });

  const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return fail(401, "Not signed in.");

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
  const { data, error } = await supabase.auth.getUser(token);
  const email = (data?.user?.email || "").toLowerCase();
  if (error || !email) return fail(401, "Session expired. Please sign in again.");
  if (!email.endsWith(COMPANY_DOMAIN)) return fail(403, "Only @strongstandard.com accounts can access this tool.");

  const params = new URL(request.url).searchParams;
  const id = params.get("id") || "";
  const range = params.get("range") || "";
  if (!ALLOWED_SHEETS.has(id)) return fail(403, "This sheet is not enabled for the tools.");
  if (!range) return fail(400, "Missing range.");

  try {
    const values = await getValues(id, range);
    return NextResponse.json({ values }, { headers });
  } catch (err) {
    return fail(502, err instanceof Error ? err.message : "Couldn't read the sheet.");
  }
}
