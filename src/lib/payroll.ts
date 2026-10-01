// Shared "how much lands this month / next month" math, used by both the
// Roster and Payouts screens so they can never silently drift apart again —
// that mismatch was a real bug we found and fixed once already.

import type { CoachClient } from "./mastersheet";

// Payroll runs in arrears on the 1st of the month AFTER the coaching period
// (e.g. August's coaching is disbursed via the September 1 payroll run).
export function payKeyForPeriod(periodKey: string): string {
  const [y, m] = periodKey.split("-").map(Number);
  const d = new Date(y, m, 1); // m is already 1-indexed, so this lands on the next month
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function monthKeyFor(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function monthLabelFromKey(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

export type PayoutMonthTotal = {
  payKey: string;
  payLabel: string;
  periodLabel: string;
  paid: boolean;
  clientCents: number; // from client coach pay + retention only, before base salary
  clientCount: number;
};

// One row per disbursement month, aggregated across every client's coach pay
// + retention for that month (clients earning $0 that month are skipped).
export function computePayoutMonths(clients: CoachClient[]): PayoutMonthTotal[] {
  const byKey = new Map<string, PayoutMonthTotal>();
  for (const client of clients) {
    const monthlyCents = client.coachPayCents + client.retentionCents;
    if (monthlyCents === 0) continue;
    for (const m of client.payoutMonths) {
      const payKey = payKeyForPeriod(m.key);
      const existing = byKey.get(payKey);
      if (existing) {
        existing.clientCents += monthlyCents;
        existing.clientCount += 1;
      } else {
        byKey.set(payKey, {
          payKey,
          payLabel: monthLabelFromKey(payKey),
          periodLabel: m.label,
          paid: m.paid,
          clientCents: monthlyCents,
          clientCount: 1,
        });
      }
    }
  }
  return [...byKey.values()].sort((a, b) => (a.payKey < b.payKey ? -1 : a.payKey > b.payKey ? 1 : 0));
}

// "This month" (already disbursed) and "next payout" (upcoming), the two
// headline figures both Roster and Payouts show — kept in one place so they
// can never disagree on which month is "current" or how it's computed.
export function thisAndNextPayout(clients: CoachClient[]) {
  const months = computePayoutMonths(clients);
  const now = new Date();
  const currentKey = monthKeyFor(now);
  const nextKey = monthKeyFor(new Date(now.getFullYear(), now.getMonth() + 1, 1));
  return {
    months,
    currentKey,
    nextKey,
    thisMonth: months.find((m) => m.payKey === currentKey),
    // Headline "next payout" comes from the same slip math the Payouts tab
    // breaks down, so Roster and Payouts always show the same number.
    // This month's pay date covers last month's coaching, matching the first
    // card on the Payouts tab.
    nextMonth: (() => {
      const slip = payrollSlip(clients, currentKey);
      return { payKey: currentKey, clientCents: slip.activeCents + slip.retentionCents };
    })(),
  };
}

export type UpcomingPayout = {
  payKey: string;
  payLabel: string;
  periodLabel: string;
  clientCents: number;
  clientCount: number;
};

// A pay month's coaching period is always the month right before it.
function periodLabelForPayKey(payKey: string): string {
  const [y, m] = payKey.split("-").map(Number); // m is 1-indexed pay month
  return new Date(y, m - 2, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

// The next `count` upcoming payouts, starting with the current pay month
// (which pays last month's coaching) — a coach's requested "see my next 3 paychecks" preview. Included even
// for months with no client coaching pay yet lined up, since base salary
// (added by the caller) still lands every month regardless.
export function nextPayouts(clients: CoachClient[], count: number): UpcomingPayout[] {
  const months = computePayoutMonths(clients);
  const now = new Date();
  const result: UpcomingPayout[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const payKey = monthKeyFor(d);
    const match = months.find((m) => m.payKey === payKey);
    result.push({
      payKey,
      payLabel: monthLabelFromKey(payKey),
      periodLabel: match?.periodLabel ?? periodLabelForPayKey(payKey),
      clientCents: match?.clientCents ?? 0,
      clientCount: match?.clientCount ?? 0,
    });
  }
  return result;
}

// ---------- per-period commission slip ----------
// Line-for-line port of renderCoach() in strongstandar/tools/payroll, so the
// breakdown a coach sees here is the same slip payroll actually pays out.

export type SlipActiveRow = {
  coachName: string;
  clientName: string;
  product: string;
  contractStart: string;
  contractEnd: string;
  coachPayCents: number;
};

export type SlipRetentionRow = {
  coachName: string;
  clientName: string;
  contractStart: string;
  contractEnd: string;
  commissionCents: number;
};

export type PayrollSlip = {
  payKey: string; // "2026-10"
  payDate: Date; // 1st of the pay month
  periodStart: Date;
  periodEnd: Date;
  periodLabel: string;
  active: SlipActiveRow[];
  retention: SlipRetentionRow[];
  activeCents: number;
  retentionCents: number;
};

const MONTHLY_SLIP_PRODUCTS = new Set(["accountability track", "strategy track"]);
const RETENTION_SALE_CUTOFF = new Date(2025, 6, 1);

function localDate(iso: string | null): Date | null {
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

export function payrollSlip(clients: CoachClient[], payKey: string): PayrollSlip {
  const [py, pm] = payKey.split("-").map(Number); // pm is 1-indexed
  const payDate = new Date(py, pm - 1, 1);
  const start = new Date(py, pm - 2, 1);
  const end = new Date(py, pm - 1, 0, 23, 59, 59);

  const active: SlipActiveRow[] = [];
  const retention: SlipRetentionRow[] = [];

  for (const c of clients) {
    const sd = localDate(c.contractStart);
    const ed = localDate(c.contractEnd);
    if (!sd || !ed || sd > end) continue;

    const isMonthly = MONTHLY_SLIP_PRODUCTS.has(c.product.trim().toLowerCase());
    const edEOD = new Date(ed.getFullYear(), ed.getMonth(), ed.getDate(), 23, 59, 59);
    const endOk = isMonthly ? edEOD >= end : ed > end;
    if (endOk && !c.isNotQualified && c.tierValue > 0 && !c.isRefunded) {
      active.push({
        coachName: c.coachName,
        clientName: c.clientName,
        product: c.product,
        contractStart: c.contractStart,
        contractEnd: c.contractEnd,
        coachPayCents: c.coachPayRawCents,
      });
    }

    const edMinusMonth = new Date(ed.getFullYear(), ed.getMonth() - 1, ed.getDate());
    const sale = localDate(c.datePurchased);
    if (
      edMinusMonth >= start &&
      c.newOrResign === "Resign" &&
      sale && sale >= RETENTION_SALE_CUTOFF &&
      !c.retentionOwnerExcluded
    ) {
      retention.push({
        coachName: c.coachName,
        clientName: c.clientName,
        contractStart: c.contractStart,
        contractEnd: c.contractEnd,
        commissionCents: c.retentionRawCents,
      });
    }
  }

  const byName = (a: { clientName: string }, b: { clientName: string }) => a.clientName.localeCompare(b.clientName);
  active.sort(byName);
  retention.sort(byName);

  return {
    payKey,
    payDate,
    periodStart: start,
    periodEnd: end,
    periodLabel: start.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
    active,
    retention,
    activeCents: active.reduce((s, r) => s + r.coachPayCents, 0),
    retentionCents: retention.reduce((s, r) => s + r.commissionCents, 0),
  };
}

// The next `count` payroll slips, starting with THIS month's pay date.
// Payroll runs on the 1st and pays the previous month, so in October the
// slips are: Sep coaching (paid Oct 1), Oct (paid Nov 1), Nov (paid Dec 1).
export function nextSlips(clients: CoachClient[], count: number): PayrollSlip[] {
  const now = new Date();
  const slips: PayrollSlip[] = [];
  for (let i = 0; i < count; i++) {
    slips.push(payrollSlip(clients, monthKeyFor(new Date(now.getFullYear(), now.getMonth() + i, 1))));
  }
  return slips;
}
