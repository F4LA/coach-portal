"use client";

import { useEffect, useMemo, useState } from "react";
import { fmtMoney } from "@/lib/coach";
import type { CoachClient } from "@/lib/mastersheet";

const ALL_COACHES = "__all__";

function monthLabelFromKey(key: string) {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

// Payroll runs in arrears on the 1st of the month AFTER the coaching period
// (e.g. August's coaching is disbursed via the September 1 payroll run) — so
// "when do I actually get paid" is always one month after the service period.
function payKeyForPeriod(periodKey: string) {
  const [y, m] = periodKey.split("-").map(Number);
  const d = new Date(y, m, 1); // m is already 1-indexed, so this lands on the next month
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

type MonthTotal = {
  payKey: string;
  payLabel: string;
  periodLabel: string;
  paid: boolean;
  totalCents: number;
  clientCount: number;
};

export function PayoutsScreen() {
  const [clients, setClients] = useState<CoachClient[] | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [coachNames, setCoachNames] = useState<string[]>([]);
  const [viewAs, setViewAs] = useState(ALL_COACHES);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setClients(null);
    setError(null);
    const qs = viewAs === ALL_COACHES ? "" : `?coach=${encodeURIComponent(viewAs)}`;
    fetch(`/api/roster${qs}`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || "Failed to load.");
        setClients(body.clients);
        setIsAdmin(body.isAdmin);
        if (body.coachNames) setCoachNames(body.coachNames);
      })
      .catch((e) => setError(e.message));
  }, [viewAs]);

  const months = useMemo(() => {
    const byKey = new Map<string, MonthTotal>();
    for (const client of clients ?? []) {
      const monthlyCents = client.coachPayCents + client.retentionCents;
      if (monthlyCents === 0) continue;
      for (const m of client.payoutMonths) {
        const payKey = payKeyForPeriod(m.key);
        const existing = byKey.get(payKey);
        if (existing) {
          existing.totalCents += monthlyCents;
          existing.clientCount += 1;
        } else {
          byKey.set(payKey, {
            payKey,
            payLabel: monthLabelFromKey(payKey),
            periodLabel: m.label,
            paid: m.paid,
            totalCents: monthlyCents,
            clientCount: 1,
          });
        }
      }
    }
    return [...byKey.values()].sort((a, b) => (a.payKey < b.payKey ? -1 : a.payKey > b.payKey ? 1 : 0));
  }, [clients]);

  const now = new Date();
  const currentKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const [nextYear, nextMonthNum] = (() => {
    const d = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return [d.getFullYear(), d.getMonth() + 1];
  })();
  const nextKey = `${nextYear}-${String(nextMonthNum).padStart(2, "0")}`;
  const thisMonth = months.find((m) => m.payKey === currentKey);
  const nextMonth = months.find((m) => m.payKey === nextKey);

  if (error) return <p style={{ color: "var(--warning)" }}>{error}</p>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {isAdmin && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div className="label" style={{ color: "var(--fg-4)" }}>VIEWING AS</div>
          <select
            className="field"
            value={viewAs}
            onChange={(e) => setViewAs(e.target.value)}
            style={{ maxWidth: 240, padding: "9px 14px" }}
          >
            <option value={ALL_COACHES}>All coaches</option>
            {coachNames.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>
      )}

      {clients === null ? (
        <p style={{ color: "var(--fg-4)" }}>Loading…</p>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16 }}>
            <div className="card-featured" style={{ padding: 22 }}>
              <div className="label" style={{ color: "var(--fg-3)" }}>PAID OUT THIS MONTH — {monthLabelFromKey(currentKey).toUpperCase()}</div>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 34, color: "var(--fg-1)", marginTop: 8 }}>
                {fmtMoney(thisMonth?.totalCents ?? 0)}
              </div>
              <div style={{ fontSize: 12, color: "var(--fg-4)", marginTop: 4 }}>
                {thisMonth ? `for ${thisMonth.periodLabel} coaching` : "nothing to pay out this month"}
              </div>
            </div>
            <div className="card" style={{ padding: 22 }}>
              <div className="label" style={{ color: "var(--fg-4)" }}>NEXT PAYOUT — {monthLabelFromKey(nextKey).toUpperCase()}</div>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 28, color: "var(--fg-1)", marginTop: 8 }}>
                {fmtMoney(nextMonth?.totalCents ?? 0)}
              </div>
              <div style={{ fontSize: 12, color: "var(--fg-4)", marginTop: 4 }}>
                {nextMonth ? `${nextMonth.clientCount} client${nextMonth.clientCount === 1 ? "" : "s"} · for ${nextMonth.periodLabel} coaching` : "nothing scheduled yet"}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {months.length === 0 ? (
              <p style={{ color: "var(--fg-4)" }}>No payouts scheduled.</p>
            ) : (
              months.map((m) => (
                <div
                  key={m.payKey}
                  className="card"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "16px 22px",
                    border: m.payKey === currentKey ? "1px solid var(--steel-a-35)" : undefined,
                  }}
                >
                  <div>
                    <div style={{ fontSize: 14, color: "var(--fg-1)" }}>{m.payLabel}</div>
                    <div style={{ fontSize: 12, color: "var(--fg-4)", marginTop: 2 }}>
                      {m.clientCount} client{m.clientCount === 1 ? "" : "s"} · for {m.periodLabel} coaching
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                    <span
                      className="label"
                      style={{ color: m.paid ? "var(--success)" : "var(--gold)" }}
                    >
                      {m.paid ? "PAID" : "UPCOMING"}
                    </span>
                    <div style={{ fontFamily: "var(--font-display)", fontSize: 20, color: "var(--fg-1)" }}>
                      {fmtMoney(m.totalCents)}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
