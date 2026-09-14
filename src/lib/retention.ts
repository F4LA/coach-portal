// Bridge to the "Retention Tracking Sheet" — a Google Apps Script Web App
// deployed on that spreadsheet (see supabase/retention_apps_script.gs) reads
// and writes the Retained/Program/Notes columns for us. The sheet stays the
// single source of truth for retention data; everything else (name, dates,
// coach) comes straight from the Master Sheet, same as the rest of the app.

import type { CoachClient } from "./mastersheet";

export const RETENTION_STATUSES = [
  "Renewed",
  "Did Not Renew - Call Done",
  "Pending Decision - Call Done",
  "Call Scheduled",
  "No Decision - No Call Scheduled",
  "MIA",
] as const;

export type RetentionStatus = (typeof RETENTION_STATUSES)[number] | "";

export type RetentionClient = CoachClient & {
  retentionStatus: RetentionStatus;
  retentionProgram: string;
  retentionNotes: string;
};

type SheetRow = {
  email: string; // already lowercased by the Apps Script side
  startDate: string; // yyyy-MM-dd
  retained: string;
  program: string;
  notes: string;
};

// The business's own Master → Retention sync (a separate Apps Script, not
// this file) copies dates across two Google Sheets documents; when they
// don't share the same timezone setting, the copied date can land a day off.
// Matching within a couple days — instead of requiring an exact string
// match — absorbs that without needing to touch that other script.
function daysApart(isoA: string, isoB: string): number {
  const da = new Date(`${isoA}T00:00:00`).getTime();
  const db = new Date(`${isoB}T00:00:00`).getTime();
  if (isNaN(da) || isNaN(db)) return Infinity;
  return Math.abs(da - db) / 86400000;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name} — set it in .env.local / Vercel env vars.`);
  return value;
}

async function callBridge(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const url = requireEnv("RETENTION_WEBAPP_URL");
  const token = requireEnv("RETENTION_WEBAPP_TOKEN");
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, token }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error("Retention sheet request failed.");
  const json = await res.json();
  if (json && typeof json === "object" && "error" in json) {
    throw new Error(String((json as { error: unknown }).error));
  }
  return json;
}

// Merges each client with its retention status/program/notes from the sheet,
// matched by email + contract start (within a couple days' tolerance — see
// daysApart) to distinguish repeat contracts for the same person.
export function mergeRetention(clients: CoachClient[], rows: SheetRow[]): RetentionClient[] {
  const byEmail = new Map<string, SheetRow[]>();
  for (const r of rows) {
    const key = r.email.trim().toLowerCase();
    const list = byEmail.get(key);
    if (list) list.push(r);
    else byEmail.set(key, [r]);
  }

  return clients.map((c) => {
    const candidates = byEmail.get(c.email.trim().toLowerCase()) ?? [];
    let best: SheetRow | undefined;
    let bestDiff = Infinity;
    for (const row of candidates) {
      const diff = daysApart(row.startDate, c.contractStart);
      if (diff <= 2 && diff < bestDiff) {
        best = row;
        bestDiff = diff;
      }
    }
    return {
      ...c,
      retentionStatus: (best?.retained as RetentionStatus) ?? "",
      retentionProgram: best?.program ?? "",
      retentionNotes: best?.notes ?? "",
    };
  });
}

export async function getRetentionRows(): Promise<SheetRow[]> {
  const result = await callBridge({ action: "list" });
  return (result.rows as SheetRow[]) ?? [];
}

export async function upsertRetention(input: {
  firstName: string;
  lastName: string;
  email: string;
  contractStart: string;
  contractEnd: string;
  coachName: string;
  retentionStatus: RetentionStatus;
  retentionProgram: string;
  retentionNotes: string;
}): Promise<void> {
  await callBridge({
    action: "upsert",
    row: {
      name: input.firstName,
      lastName: input.lastName,
      email: input.email,
      startDate: input.contractStart,
      endDate: input.contractEnd,
      coach: input.coachName,
      retained: input.retentionStatus,
      program: input.retentionProgram,
      notes: input.retentionNotes,
    },
  });
}
