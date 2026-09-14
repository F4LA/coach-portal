// Reads the Client Mastersheet Google Sheet directly instead of duplicating
// client data into our own database — same approach as the affiliate portal's
// sheet.ts. Server-only: not CORS-enabled for browser use.
//
// The month-by-month qualification logic here is ported from the real
// payroll tool (Strong Standard Payroll Portal) so the numbers a coach sees
// here match what actually gets paid: it uses raw "Contract End" (not "New
// End Date"), evaluates one calendar month at a time, and excludes refunded
// clients entirely from Coach Pay — matching that tool's Active Clients /
// Retention Commission filters exactly.

const SHEET_CSV_URL =
  "https://docs.google.com/spreadsheets/d/1ctM6K8hQfh73bi7f-MtXkqW3BaPxU73NZf8xPJQUEOc/export?format=csv&gid=0";

// Month-to-month services — checked inclusively against the period's last
// day, unlike the fixed-term "1:1 Coaching" contracts below.
const MONTHLY_PRODUCTS = new Set(["accountability track", "strategy track"]);

// Retention Commission only applies to resigns sold from this date forward.
const RETENTION_CUTOFF = new Date(2025, 6, 1); // July 1, 2025

// Company owners don't get a base salary and don't earn Retention Commission.
const OWNERS_NO_RETENTION = new Set(["bernardo", "joey"]);

// Minimal quoted-CSV parser — handles commas inside quoted money fields.
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

function parseMoneyCents(s: string | undefined): number {
  if (!s) return 0;
  const n = parseFloat(s.replace(/[^0-9.-]/g, ""));
  return isNaN(n) ? 0 : Math.round(n * 100);
}

function parseDate(s: string | undefined): Date | null {
  if (!s || !s.trim()) return null;
  const d = new Date(s.trim());
  return isNaN(d.getTime()) ? null : d;
}

function isoDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

type ColumnIndex = ReturnType<typeof columnIndex>;

function columnIndex(header: string[]) {
  const col = (name: string) => header.indexOf(name);
  return {
    iFirst: col("First Name"),
    iLast: col("Last Name"),
    iEmail: col("Email Address"),
    iProduct: col("Product"),
    iPackage: col("$ Package"),
    iDatePurchased: col("Date Purchased"),
    iStart: col("Contract Start"),
    iEnd: col("Contract End"),
    iDuration: col("Coaching Duration"),
    iCoach: col("Coach"),
    iTier: col("Tier"),
    iCoachPay: col("Coach Pay"),
    iNewOrResign: col("New or Resign"),
    iRetentionComm: col("Retention Commission"),
    iNotQualified: col("Not Qualified for Commission"),
    iRefundFlag: col("14 Days Refund?"),
    iRefundDate: col("Refund Date"),
  };
}

export type PayoutMonth = {
  key: string; // "2026-08", for grouping/sorting across clients
  label: string; // "August 2026"
  paid: boolean; // true once that payroll month has arrived
};

export type CoachClient = {
  coachName: string;
  clientName: string;
  firstName: string;
  lastName: string;
  email: string;
  product: string;
  packageCents: number;
  contractStart: string; // ISO date
  contractEnd: string; // ISO date — raw "Contract End", same field payroll uses
  durationMonths: number;
  tier: string;
  coachPayCents: number; // flat rate per qualifying month — 0 if refunded/non-qualified/no tier
  retentionCents: number; // extra per qualifying month for eligible resigns — 0 otherwise
  newOrResign: "New" | "Resign";
  isRefunded: boolean;
  refundDate: string | null;
  payoutMonths: PayoutMonth[]; // months this contract is considered active, per payroll's own logic
  totalScheduledCents: number; // (coachPay + retention) across all payoutMonths
  totalPaidSoFarCents: number; // same, but only months already past
};

// Walks forward one calendar month at a time from the contract's start month,
// stopping as soon as a month no longer qualifies — mirrors the real payroll
// tool's per-period "is this client still active this month" check instead of
// trusting "Coaching Duration" to always match Start/End exactly (it doesn't,
// for ~15% of rows).
function computeQualifyingMonths(start: Date, contractEnd: Date, isMonthly: boolean): { year: number; month: number }[] {
  const months: { year: number; month: number }[] = [];
  for (let i = 0; i < 120; i++) {
    // Build the candidate period from a Date so JS rolls the year over on its
    // own past December — reducing "start.getMonth() + i" with a plain %12
    // (as this used to do) silently repeats January-through-November from the
    // wrong year for any contract running past 12 months.
    const periodFirst = new Date(start.getFullYear(), start.getMonth() + i, 1);
    const nextMonthFirst = new Date(periodFirst.getFullYear(), periodFirst.getMonth() + 1, 1);
    const lastDayOfPeriod = new Date(periodFirst.getFullYear(), periodFirst.getMonth() + 1, 0);
    const qualifies = isMonthly
      ? contractEnd.getTime() >= lastDayOfPeriod.getTime()
      : contractEnd.getTime() >= nextMonthFirst.getTime();
    if (!qualifies) break;
    months.push({ year: periodFirst.getFullYear(), month: periodFirst.getMonth() });
  }
  return months;
}

function rowToClient(row: string[], idx: ColumnIndex, nowYM: number): CoachClient | null {
  const start = parseDate(row[idx.iStart]);
  const end = parseDate(row[idx.iEnd]);
  const duration = parseInt(row[idx.iDuration], 10);
  if (!start || !end) return null;

  const firstName = row[idx.iFirst]?.trim() ?? "";
  const lastName = row[idx.iLast]?.trim() ?? "";
  if (!firstName && !lastName) return null;

  const product = row[idx.iProduct]?.trim() ?? "";
  const isMonthly = MONTHLY_PRODUCTS.has(product.toLowerCase());
  const isRefunded = row[idx.iRefundFlag]?.trim() === "TRUE";
  const isNotQualified = row[idx.iNotQualified]?.trim() === "TRUE";
  const tier = row[idx.iTier]?.trim() ?? "";
  const tierValue = parseFloat(tier);
  const newOrResign: "New" | "Resign" = row[idx.iNewOrResign]?.trim() === "Resign" ? "Resign" : "New";

  const coachName = row[idx.iCoach]?.trim() ?? "";
  const datePurchased = parseDate(row[idx.iDatePurchased]);
  const isRetentionEligible =
    newOrResign === "Resign" &&
    !!datePurchased &&
    datePurchased.getTime() >= RETENTION_CUTOFF.getTime() &&
    !OWNERS_NO_RETENTION.has(coachName.toLowerCase());

  // Matches the real payroll tool's Active Clients filter: refunded, not
  // qualified, or missing a tier means this client never generates Coach Pay.
  const earnsCoachPay = !isRefunded && !isNotQualified && !isNaN(tierValue) && tierValue > 0;

  const qualifyingMonths = computeQualifyingMonths(start, end, isMonthly);
  const coachPayCents = earnsCoachPay ? parseMoneyCents(row[idx.iCoachPay]) : 0;
  const retentionCents = isRetentionEligible ? parseMoneyCents(row[idx.iRetentionComm]) : 0;
  const monthlyCents = coachPayCents + retentionCents;

  const payoutMonths: PayoutMonth[] = [];
  let totalScheduledCents = 0;
  let totalPaidSoFarCents = 0;
  for (const { year, month } of qualifyingMonths) {
    const ym = year * 12 + month;
    // Payroll runs in arrears on the 1st of the FOLLOWING month (e.g. September's
    // coaching is disbursed via the October 1 payroll run) — so a period only
    // counts as paid once the calendar has moved past its own month entirely.
    const paid = ym < nowYM;
    const key = `${year}-${String(month + 1).padStart(2, "0")}`;
    const label = new Date(year, month, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
    payoutMonths.push({ key, label, paid });
    totalScheduledCents += monthlyCents;
    if (paid) totalPaidSoFarCents += monthlyCents;
  }

  return {
    coachName,
    clientName: `${firstName} ${lastName}`.trim(),
    firstName,
    lastName,
    email: row[idx.iEmail]?.trim() ?? "",
    product,
    packageCents: parseMoneyCents(row[idx.iPackage]),
    contractStart: isoDate(start),
    contractEnd: isoDate(end),
    durationMonths: isNaN(duration) ? qualifyingMonths.length : duration,
    tier,
    coachPayCents,
    retentionCents,
    newOrResign,
    isRefunded,
    refundDate: row[idx.iRefundDate]?.trim() || null,
    payoutMonths,
    totalScheduledCents,
    totalPaidSoFarCents,
  };
}

async function fetchRows(): Promise<{ header: string[]; rows: string[][] }> {
  const res = await fetch(SHEET_CSV_URL, { cache: "no-store" });
  if (!res.ok) throw new Error("Couldn't load the mastersheet.");
  const text = await res.text();
  const rows = parseCsv(text);
  return { header: rows[0], rows: rows.slice(1) };
}

export async function getClientsForCoach(coachName: string): Promise<CoachClient[]> {
  const clients = await getAllClients();
  const target = coachName.trim().toLowerCase();
  return clients.filter((c) => c.coachName.toLowerCase() === target);
}

export async function getAllClients(): Promise<CoachClient[]> {
  const { header, rows } = await fetchRows();
  const idx = columnIndex(header);
  const now = new Date();
  const nowYM = now.getFullYear() * 12 + now.getMonth();

  const clients: CoachClient[] = [];
  for (const row of rows) {
    const client = rowToClient(row, idx, nowYM);
    if (client) clients.push(client);
  }

  clients.sort((a, b) => (a.contractStart < b.contractStart ? 1 : -1));
  return clients;
}

export async function getDistinctCoachNames(): Promise<string[]> {
  const { header, rows } = await fetchRows();
  const idx = columnIndex(header);
  const names = new Set<string>();
  for (const row of rows) {
    const name = (row[idx.iCoach] ?? "").trim();
    if (name) names.add(name);
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}
