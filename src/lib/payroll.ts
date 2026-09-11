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
    nextMonth: months.find((m) => m.payKey === nextKey),
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

// The next `count` upcoming payouts, starting the month after the current
// one — a coach's requested "see my next 3 paychecks" preview. Included even
// for months with no client coaching pay yet lined up, since base salary
// (added by the caller) still lands every month regardless.
export function nextPayouts(clients: CoachClient[], count: number): UpcomingPayout[] {
  const months = computePayoutMonths(clients);
  const now = new Date();
  const result: UpcomingPayout[] = [];
  for (let i = 1; i <= count; i++) {
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
