// Server-only reads of PRIVATE Google Sheets through the "ss-tools-sheets"
// service account. Each sheet must be shared with the service account email
// (Viewer). Credentials come from the GOOGLE_SERVICE_ACCOUNT_JSON env var
// (the full JSON key file pasted into Vercel), never from the browser.

import { createSign } from "crypto";

type ServiceAccount = { client_email: string; private_key: string };

let tokenCache: { token: string; expires: number } | null = null;

function serviceAccount(): ServiceAccount {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is not set.");
  const json = JSON.parse(raw);
  return {
    client_email: json.client_email,
    private_key: String(json.private_key).replace(/\\n/g, "\n"),
  };
}

const b64url = (input: Buffer | string) =>
  Buffer.from(input).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");

async function accessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (tokenCache && tokenCache.expires - 60 > now) return tokenCache.token;

  const sa = serviceAccount();
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/spreadsheets.readonly",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    })
  );
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claims}`);
  const signature = b64url(signer.sign(sa.private_key));

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${header}.${claims}.${signature}`,
    }),
    cache: "no-store",
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`Google auth failed: ${body.error_description || body.error || res.status}`);
  tokenCache = { token: body.access_token, expires: now + Number(body.expires_in || 3600) };
  return tokenCache.token;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function sheetsGet(path: string): Promise<any> {
  const token = await accessToken();
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error?.message || `Sheets HTTP ${res.status}`);
  return body;
}

// Same shape as the old public "values?key=" API: string[][], trailing empty
// cells omitted. Range is A1 notation, e.g. "Payment Plan!A:F".
export async function getValues(spreadsheetId: string, range: string): Promise<string[][]> {
  const body = await sheetsGet(`${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}`);
  return body.values || [];
}

// Replacement for the old "export?format=csv&gid=N" reads: returns the whole
// tab (by gid, or the first tab when gid is omitted) with every row padded to
// the same width, so code written for CSV keeps seeing "" for empty cells.
export async function getSheetRowsByGid(spreadsheetId: string, gid?: number): Promise<string[][]> {
  const meta = await sheetsGet(
    `${encodeURIComponent(spreadsheetId)}?fields=sheets.properties(sheetId,title,index)`
  );
  const sheets: { properties: { sheetId: number; title: string; index: number } }[] = meta.sheets || [];
  const tab =
    gid === undefined
      ? sheets.slice().sort((a, b) => a.properties.index - b.properties.index)[0]
      : sheets.find((s) => s.properties.sheetId === gid);
  if (!tab) throw new Error("Sheet tab not found.");

  const title = `'${tab.properties.title.replace(/'/g, "''")}'`;
  const rows = await getValues(spreadsheetId, title);
  const width = rows.reduce((max, r) => Math.max(max, r.length), 0);
  return rows.map((r) => {
    const padded = r.map((c) => (c == null ? "" : String(c)));
    while (padded.length < width) padded.push("");
    return padded;
  });
}
