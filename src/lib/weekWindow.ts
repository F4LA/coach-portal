// Coaching-week math: Thursday 00:00 ET → Wednesday 23:59:59.999 ET.
// Ported from the written spec (Claude did not have access to CoachPulse's
// own implementation to copy directly) — if CoachPulse's window ever turns
// out to differ from this, this is the file to reconcile.

const TZ = "America/New_York";
const DOW: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export type WeekWindow = {
  key: string; // ISO date of the week's Thursday, e.g. "2026-09-11" — used as a stable id
  start: Date; // Thursday 00:00:00.000 ET, as a UTC instant
  end: Date; // Wednesday 23:59:59.999 ET, as a UTC instant
  label: string; // "Thu Sep 11 – Wed Sep 17"
};

function etCalendarParts(date: Date) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  });
  const parts = Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    weekday: parts.weekday as keyof typeof DOW,
  };
}

// The ET UTC offset (in whole hours, negative) at roughly the given instant —
// good enough to resolve EST(-5)/EDT(-4) outside the ~1hr DST-transition
// instant itself, which this feature doesn't need to be precise within.
function etOffsetHours(date: Date): number {
  const fmt = new Intl.DateTimeFormat("en-US", { timeZone: TZ, timeZoneName: "shortOffset" });
  const part = fmt.formatToParts(date).find((p) => p.type === "timeZoneName")?.value ?? "GMT-5";
  const match = part.match(/GMT([+-]\d+)/);
  return match ? Number(match[1]) : -5;
}

export function etWallClockToUtc(year: number, month: number, day: number, hour: number, minute: number, second: number, ms: number): Date {
  const naiveUtcMs = Date.UTC(year, month - 1, day, hour, minute, second, ms);
  const offsetHours = etOffsetHours(new Date(naiveUtcMs));
  return new Date(naiveUtcMs - offsetHours * 3600000);
}

function ymd(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function addDays(year: number, month: number, day: number, delta: number) {
  const d = new Date(year, month - 1, day + delta);
  return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() };
}

// The Thursday-start-date key for whichever week `date` falls into.
export function weekKeyFor(date: Date): string {
  const parts = etCalendarParts(date);
  const daysSinceThursday = (DOW[parts.weekday] - DOW.Thu + 7) % 7;
  const thu = addDays(parts.year, parts.month, parts.day, -daysSinceThursday);
  return ymd(thu.year, thu.month, thu.day);
}

export function weekWindowForKey(key: string): WeekWindow {
  const [y, m, d] = key.split("-").map(Number);
  const start = etWallClockToUtc(y, m, d, 0, 0, 0, 0);
  const wed = addDays(y, m, d, 6);
  const end = etWallClockToUtc(wed.year, wed.month, wed.day, 23, 59, 59, 999);
  const startLabel = start.toLocaleDateString("en-US", { timeZone: TZ, weekday: "short", month: "short", day: "numeric" });
  const endLabel = end.toLocaleDateString("en-US", { timeZone: TZ, weekday: "short", month: "short", day: "numeric", year: "numeric" });
  return { key, start, end, label: `${startLabel} – ${endLabel}` };
}

export function weekWindowFor(date: Date): WeekWindow {
  return weekWindowForKey(weekKeyFor(date));
}

export function isWeekClosed(window: WeekWindow, now: Date): boolean {
  return now.getTime() > window.end.getTime();
}

export function previousWeekKey(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  const prev = addDays(y, m, d, -7);
  return ymd(prev.year, prev.month, prev.day);
}

export function nextWeekKey(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  const next = addDays(y, m, d, 7);
  return ymd(next.year, next.month, next.day);
}

// Most recent `count` week keys, current week first.
export function recentWeekKeys(now: Date, count: number): string[] {
  const keys: string[] = [weekKeyFor(now)];
  for (let i = 1; i < count; i++) keys.push(previousWeekKey(keys[keys.length - 1]));
  return keys;
}
