// Reads the Client Mastersheet Google Sheet directly instead of duplicating
// client data into our own database — same approach as the affiliate portal's
// sheet.ts. Server-only: not CORS-enabled for browser use.

const SHEET_CSV_URL =
  "https://docs.google.com/spreadsheets/d/1ctM6K8hQfh73bi7f-MtXkqW3BaPxU73NZf8xPJQUEOc/export?format=csv&gid=0";

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

function addMonths(d: Date, months: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + months, d.getDate());
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
    iStart: col("Contract Start"),
    iEnd: col("Contract End"),
    iNewEnd: col("New End Date"),
    iDuration: col("Coaching Duration"),
    iCoach: col("Coach"),
    iTier: col("Tier"),
    iCoachPay: col("Coach Pay"),
    iNewOrResign: col("New or Resign"),
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
  email: string;
  product: string;
  packageCents: number;
  contractStart: string; // ISO date
  contractEnd: string; // ISO date — "New End Date" when set, else "Contract End"
  durationMonths: number;
  tier: string;
  coachPayCents: number; // flat rate paid per payroll month
  newOrResign: "New" | "Resign";
  isRefunded: boolean;
  refundDate: string | null;
  payoutMonths: PayoutMonth[];
  totalScheduledCents: number;
  totalPaidSoFarCents: number;
};

function rowToClient(row: string[], idx: ColumnIndex, nowYM: number): CoachClient | null {
  const start = parseDate(row[idx.iStart]);
  const duration = parseInt(row[idx.iDuration], 10);
  if (!start || isNaN(duration) || duration <= 0) return null;

  const endRaw = row[idx.iNewEnd]?.trim() || row[idx.iEnd]?.trim();
  const end = parseDate(endRaw) ?? addMonths(start, duration);
  const coachPayCents = parseMoneyCents(row[idx.iCoachPay]);

  const payoutMonths: PayoutMonth[] = [];
  let totalScheduledCents = 0;
  let totalPaidSoFarCents = 0;
  for (let i = 0; i < duration; i++) {
    const d = new Date(start.getFullYear(), start.getMonth() + i, 1);
    const ym = d.getFullYear() * 12 + d.getMonth();
    const paid = ym <= nowYM;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    payoutMonths.push({ key, label: d.toLocaleDateString("en-US", { month: "long", year: "numeric" }), paid });
    totalScheduledCents += coachPayCents;
    if (paid) totalPaidSoFarCents += coachPayCents;
  }

  const firstName = row[idx.iFirst]?.trim() ?? "";
  const lastName = row[idx.iLast]?.trim() ?? "";
  if (!firstName && !lastName) return null;

  return {
    coachName: row[idx.iCoach]?.trim() ?? "",
    clientName: `${firstName} ${lastName}`.trim(),
    email: row[idx.iEmail]?.trim() ?? "",
    product: row[idx.iProduct]?.trim() ?? "",
    packageCents: parseMoneyCents(row[idx.iPackage]),
    contractStart: isoDate(start),
    contractEnd: isoDate(end),
    durationMonths: duration,
    tier: row[idx.iTier]?.trim() ?? "",
    coachPayCents,
    newOrResign: row[idx.iNewOrResign]?.trim() === "Resign" ? "Resign" : "New",
    isRefunded: row[idx.iRefundFlag]?.trim() === "TRUE",
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
