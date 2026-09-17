// Weekly Form Tracker — joins the Active Client Roster sheet (denominator)
// against the Form Responses sheet (numerator) for a given coaching week.
// Both sheets are read the same way the Master Sheet already is: public CSV
// export, no service account. Closed weeks are frozen into Supabase so
// history and consecutive-miss detection don't depend on the live sheets
// staying unchanged after the fact.

import { parseCsv } from "./csv";
import { createAdminClient } from "./supabase/admin";
import { etWallClockToUtc, isWeekClosed, previousWeekKey, weekWindowForKey, type WeekWindow } from "./weekWindow";

const ROSTER_CSV_URL =
  "https://docs.google.com/spreadsheets/d/1VxxqmOVuXffLOpPvMWnSUHhyhkjIajtBeBoSV3xk1fc/export?format=csv";
const RESPONSES_CSV_URL =
  "https://docs.google.com/spreadsheets/d/1ugM0iOCwdaQpyDVPuJQfKRhu72NQrtC-hEjJ7PkGHoA/export?format=csv";

// Bernardo and Joey are company owners, not coaches with a client caseload —
// same exclusion the Retention/Payouts screens already apply.
export const INCLUDED_COACHES = ["Brent", "Ceci", "Miguel", "Jackie"] as const;
const INCLUDED_COACH_SET = new Set<string>(INCLUDED_COACHES);

const WEEKDAYS = new Set(["Mon", "Tue", "Wed", "Thu", "Fri"]);

export type ClientWeekState = "sent" | "exempt" | "pending" | "never_sent";

export type DueLabel = { kind: "overdue" | "not_yet_due"; label: string };

export type ClientWeekRow = {
  clientName: string;
  coachName: string;
  state: ClientWeekState;
  timestampIso: string | null; // this week's submission, if any
  lastSubmittedIso: string | null; // most recent submission ever, any week
  consecutiveMisses: number; // 0 unless state is pending/never_sent and it's been missed 2+ weeks running
  checkInDay: string | null;
  dueLabel: DueLabel | null; // only set for an open week's Pending clients with a known check-in day
};

export type FormTrackerWeekData = {
  window: { key: string; label: string };
  closed: boolean;
  clients: ClientWeekRow[];
  unmatchedFormClientCount: number;
  unmatchedFormClientSample: string[];
};

type ParsedResponse = { timestamp: Date; exempt: boolean };

type RosterClient = { clientName: string; coachName: string; checkInDay: string | null };

function parseUsTimestamp(raw: string | undefined): Date | null {
  if (!raw) return null;
  const m = raw.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})$/);
  if (!m) return null;
  const [, mo, d, y, h, mi, s] = m.map(Number);
  // Form timestamps carry no timezone marker; treated as ET, matching the
  // rest of this feature's week-window math.
  return etWallClockToUtc(y, mo, d, h, mi, s, 0);
}

async function fetchCsvRows(url: string): Promise<string[][]> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error("Couldn't load the sheet.");
  return parseCsv(await res.text());
}

async function loadData(): Promise<{
  roster: RosterClient[];
  responsesByClient: Map<string, ParsedResponse[]>;
  unmatched: { count: number; sample: string[] };
}> {
  const [rosterRows, responseRows] = await Promise.all([
    fetchCsvRows(ROSTER_CSV_URL),
    fetchCsvRows(RESPONSES_CSV_URL),
  ]);

  const rHeader = rosterRows[0];
  const rIdx = {
    clientName: rHeader.indexOf("Client Name"),
    coach: rHeader.indexOf("Coach"),
    checkInDay: rHeader.indexOf("CheckInDay"),
  };

  const roster: RosterClient[] = [];
  const rosterKeys = new Set<string>();
  for (const row of rosterRows.slice(1)) {
    const coach = row[rIdx.coach]?.trim();
    const clientName = row[rIdx.clientName]?.trim();
    if (!clientName || !coach || !INCLUDED_COACH_SET.has(coach)) continue;
    const rawCheckIn = rIdx.checkInDay >= 0 ? row[rIdx.checkInDay]?.trim() : "";
    roster.push({
      clientName,
      coachName: coach,
      checkInDay: rawCheckIn && WEEKDAYS.has(rawCheckIn) ? rawCheckIn : null,
    });
    rosterKeys.add(clientName.toLowerCase());
  }

  const respHeader = responseRows[0];
  const respIdx = {
    timestamp: respHeader.indexOf("Timestamp"),
    client: respHeader.indexOf("Client"),
    exempt: respHeader.indexOf("Does this client have an Exempt this week?"),
  };

  const responsesByClient = new Map<string, ParsedResponse[]>();
  const unmatchedNames = new Map<string, number>();
  for (const row of responseRows.slice(1)) {
    const clientRaw = row[respIdx.client]?.trim();
    if (!clientRaw) continue;
    const timestamp = parseUsTimestamp(row[respIdx.timestamp]);
    if (!timestamp) continue;
    const key = clientRaw.toLowerCase();
    if (!rosterKeys.has(key)) {
      unmatchedNames.set(clientRaw, (unmatchedNames.get(clientRaw) ?? 0) + 1);
      continue;
    }
    const exempt = (row[respIdx.exempt] ?? "").trim().toLowerCase() === "yes";
    const entry: ParsedResponse = { timestamp, exempt };
    const list = responsesByClient.get(key);
    if (list) list.push(entry);
    else responsesByClient.set(key, [entry]);
  }
  for (const list of responsesByClient.values()) list.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  return {
    roster,
    responsesByClient,
    unmatched: { count: unmatchedNames.size, sample: [...unmatchedNames.keys()].slice(0, 10) },
  };
}

const WEEKDAY_OFFSET_FROM_THU: Record<string, number> = { Thu: 0, Fri: 1, Sat: 2, Sun: 3, Mon: 4, Tue: 5, Wed: 6 };

function computeDueLabel(now: Date, window: WeekWindow, checkInDay: string | null): DueLabel | null {
  if (!checkInDay) return null;
  const offset = WEEKDAY_OFFSET_FROM_THU[checkInDay] ?? 0;
  const checkInInstant = new Date(window.start.getTime() + offset * 86400000);
  const daysDiff = Math.round((checkInInstant.getTime() - now.getTime()) / 86400000);
  if (daysDiff < 0) {
    const lateDays = Math.abs(daysDiff);
    return { kind: "overdue", label: `${lateDays} day${lateDays === 1 ? "" : "s"} late` };
  }
  if (daysDiff === 0) return { kind: "not_yet_due", label: "Due today" };
  if (daysDiff === 1) return { kind: "not_yet_due", label: "Due tomorrow" };
  return { kind: "not_yet_due", label: `Due in ${daysDiff} days` };
}

function hasQualifyingResponse(history: ParsedResponse[], window: WeekWindow): boolean {
  return history.some((r) => r.timestamp >= window.start && r.timestamp <= window.end);
}

const MAX_CONSECUTIVE_LOOKBACK = 26; // ~half a year — just a sane bound, not a real limit

function countConsecutiveMisses(history: ParsedResponse[], startWeekKey: string): number {
  let count = 0;
  let cursorKey = startWeekKey;
  for (let i = 0; i < MAX_CONSECUTIVE_LOOKBACK; i++) {
    const w = weekWindowForKey(cursorKey);
    if (hasQualifyingResponse(history, w)) break;
    count++;
    cursorKey = previousWeekKey(cursorKey);
  }
  return count;
}

function computeWeekData(
  window: WeekWindow,
  closed: boolean,
  now: Date,
  roster: RosterClient[],
  responsesByClient: Map<string, ParsedResponse[]>,
  unmatched: { count: number; sample: string[] }
): FormTrackerWeekData {
  const clients: ClientWeekRow[] = roster.map((client) => {
    const key = client.clientName.trim().toLowerCase();
    const history = responsesByClient.get(key) ?? [];
    const inWindow = history.filter((r) => r.timestamp >= window.start && r.timestamp <= window.end);

    let state: ClientWeekState;
    let timestampIso: string | null = null;
    if (inWindow.length > 0) {
      const exemptOne = inWindow.find((r) => r.exempt);
      if (exemptOne) {
        state = "exempt";
        timestampIso = exemptOne.timestamp.toISOString();
      } else {
        state = "sent";
        timestampIso = inWindow[inWindow.length - 1].timestamp.toISOString();
      }
    } else {
      state = closed ? "never_sent" : "pending";
    }

    const last = history.length > 0 ? history[history.length - 1] : null;
    const consecutiveMisses =
      state === "pending" || state === "never_sent" ? countConsecutiveMisses(history, window.key) : 0;
    const dueLabel = !closed && state === "pending" ? computeDueLabel(now, window, client.checkInDay) : null;

    return {
      clientName: client.clientName,
      coachName: client.coachName,
      state,
      timestampIso,
      lastSubmittedIso: last ? last.timestamp.toISOString() : null,
      consecutiveMisses,
      checkInDay: client.checkInDay,
      dueLabel,
    };
  });

  return {
    window: { key: window.key, label: window.label },
    closed,
    clients,
    unmatchedFormClientCount: unmatched.count,
    unmatchedFormClientSample: unmatched.sample,
  };
}

async function readFrozenWeek(weekKey: string): Promise<FormTrackerWeekData | null> {
  const supabase = createAdminClient();
  const { data } = await supabase.from("form_tracker_week").select("payload").eq("week_key", weekKey).maybeSingle();
  return (data?.payload as FormTrackerWeekData | undefined) ?? null;
}

async function writeFrozenWeek(weekKey: string, data: FormTrackerWeekData): Promise<void> {
  const supabase = createAdminClient();
  await supabase
    .from("form_tracker_week")
    .upsert({ week_key: weekKey, payload: data, computed_at: new Date().toISOString() });
}

export async function getFormTrackerWeek(weekKey: string, now: Date = new Date()): Promise<FormTrackerWeekData> {
  const window = weekWindowForKey(weekKey);
  const closed = isWeekClosed(window, now);

  if (closed) {
    const cached = await readFrozenWeek(weekKey);
    if (cached) return cached;
  }

  const { roster, responsesByClient, unmatched } = await loadData();
  const data = computeWeekData(window, closed, now, roster, responsesByClient, unmatched);

  if (closed) await writeFrozenWeek(weekKey, data);

  return data;
}
