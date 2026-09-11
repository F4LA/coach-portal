"use client";

import { useEffect, useMemo, useState } from "react";
import { fmtMoney } from "@/lib/coach";
import type { CoachClient } from "@/lib/mastersheet";
import { nextPayouts } from "@/lib/payroll";

const ALL_COACHES = "__all__";
const UPCOMING_COUNT = 3;

export function PayoutsScreen() {
  const [clients, setClients] = useState<CoachClient[] | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [coachNames, setCoachNames] = useState<string[]>([]);
  const [viewAs, setViewAs] = useState(ALL_COACHES);
  const [error, setError] = useState<string | null>(null);
  const [baseSalaryCents, setBaseSalaryCents] = useState(0);

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
        setBaseSalaryCents(body.baseSalaryCents ?? 0);
      })
      .catch((e) => setError(e.message));
  }, [viewAs]);

  const upcoming = useMemo(() => nextPayouts(clients ?? [], UPCOMING_COUNT), [clients]);

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
        <div>
          <div className="label" style={{ color: "var(--fg-4)", marginBottom: 10 }}>NEXT {UPCOMING_COUNT} PAYOUTS</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16 }}>
            {upcoming.map((m, i) => (
              <div key={m.payKey} className={i === 0 ? "card-featured" : "card"} style={{ padding: 22 }}>
                <div className="label" style={{ color: i === 0 ? "var(--fg-3)" : "var(--fg-4)" }}>{m.payLabel.toUpperCase()}</div>
                <div style={{ fontFamily: "var(--font-display)", fontSize: i === 0 ? 34 : 28, color: "var(--fg-1)", marginTop: 8 }}>
                  {fmtMoney(m.clientCents + baseSalaryCents)}
                </div>
                <div style={{ fontSize: 12, color: "var(--fg-4)", marginTop: 4 }}>
                  {m.clientCount > 0
                    ? `${m.clientCount} client${m.clientCount === 1 ? "" : "s"} · for ${m.periodLabel} coaching`
                    : `for ${m.periodLabel} coaching`}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
