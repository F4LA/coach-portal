// Payroll -> Slack sender for strongstandard.com/tools/payroll (GitHub Pages).
// The page signs in with Google (Supabase), sends its access token here, and:
//   GET  -> list of Slack members (to pick who receives each slip)
//   POST -> uploads the slip PDF and DMs it to one member with a message
// Only @strongstandard.com accounts. Uses SLACK_BOT_TOKEN (Vercel env var),
// which never reaches the browser.

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const maxDuration = 30;

const ALLOWED_ORIGINS = new Set([
  "https://strongstandard.com",
  "https://www.strongstandard.com",
]);
const COMPANY_DOMAIN = "@strongstandard.com";
const MAX_PDF_BYTES = 3 * 1024 * 1024;

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

type SlackResp = { ok: boolean; error?: string; [k: string]: unknown };

async function slack(method: string, init: { json?: unknown; form?: Record<string, string>; get?: Record<string, string> }): Promise<SlackResp> {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) throw new Error("SLACK_BOT_TOKEN is not set in Vercel.");
  let url = `https://slack.com/api/${method}`;
  const opts: RequestInit = { headers: { Authorization: `Bearer ${token}` } };
  if (init.get) {
    url += "?" + new URLSearchParams(init.get).toString();
  } else if (init.form) {
    opts.method = "POST";
    (opts.headers as Record<string, string>)["Content-Type"] = "application/x-www-form-urlencoded";
    opts.body = new URLSearchParams(init.form).toString();
  } else {
    opts.method = "POST";
    (opts.headers as Record<string, string>)["Content-Type"] = "application/json; charset=utf-8";
    opts.body = JSON.stringify(init.json || {});
  }
  const res = await fetch(url, opts);
  const body = (await res.json().catch(() => ({ ok: false, error: `HTTP ${res.status}` }))) as SlackResp;
  if (!body.ok) throw new Error(`Slack ${method}: ${body.error || "failed"}`);
  return body;
}

export async function OPTIONS(request: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request) });
}

type SlackMember = {
  id: string; name?: string; deleted?: boolean; is_bot?: boolean;
  profile?: { real_name?: string; display_name?: string; email?: string };
};

export async function GET(request: Request) {
  const headers = corsHeaders(request);
  const auth = await checkUser(request);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status, headers });
  try {
    const members: { id: string; realName: string; displayName: string; email: string }[] = [];
    let cursor = "";
    for (let i = 0; i < 10; i++) {
      const page = await slack("users.list", { get: { limit: "200", ...(cursor ? { cursor } : {}) } });
      for (const m of (page.members as SlackMember[]) || []) {
        if (m.deleted || m.is_bot || m.id === "USLACKBOT") continue;
        members.push({
          id: m.id,
          realName: m.profile?.real_name || m.name || "",
          displayName: m.profile?.display_name || "",
          email: (m.profile?.email || "").toLowerCase(),
        });
      }
      cursor = ((page.response_metadata as { next_cursor?: string }) || {}).next_cursor || "";
      if (!cursor) break;
    }
    members.sort((a, b) => a.realName.localeCompare(b.realName));
    return NextResponse.json({ members }, { headers });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Couldn't list Slack members." }, { status: 502, headers });
  }
}

export async function POST(request: Request) {
  const headers = corsHeaders(request);
  const auth = await checkUser(request);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status, headers });

  let body: { userId?: string; message?: string; filename?: string; pdfBase64?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Bad request." }, { status: 400, headers }); }
  const userId = String(body.userId || "");
  const message = String(body.message || "").slice(0, 3500);
  const filename = (String(body.filename || "Payroll Slip.pdf").replace(/[^\w .()\-]/g, "") || "Payroll Slip.pdf").slice(0, 120);
  if (!/^[UW][A-Z0-9]+$/.test(userId)) return NextResponse.json({ error: "Pick a Slack member to send to." }, { status: 400, headers });
  if (!body.pdfBase64) return NextResponse.json({ error: "Missing PDF." }, { status: 400, headers });

  const pdf = Buffer.from(body.pdfBase64, "base64");
  if (!pdf.length || pdf.length > MAX_PDF_BYTES) return NextResponse.json({ error: "PDF is empty or too large." }, { status: 400, headers });
  if (pdf.subarray(0, 4).toString() !== "%PDF") return NextResponse.json({ error: "File is not a PDF." }, { status: 400, headers });

  try {
    const im = await slack("conversations.open", { json: { users: userId } });
    const channelId = (im.channel as { id: string }).id;

    const up = await slack("files.getUploadURLExternal", { form: { filename, length: String(pdf.length) } });
    const putRes = await fetch(up.upload_url as string, {
      method: "POST",
      headers: { "Content-Type": "application/pdf" },
      body: new Uint8Array(pdf),
    });
    if (!putRes.ok) throw new Error(`Slack upload failed (HTTP ${putRes.status}).`);

    await slack("files.completeUploadExternal", {
      json: {
        files: [{ id: up.file_id as string, title: filename.replace(/\.pdf$/i, "") }],
        channel_id: channelId,
        initial_comment: message,
      },
    });
    return NextResponse.json({ ok: true, sentBy: auth.email }, { headers });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Couldn't send to Slack." }, { status: 502, headers });
  }
}
