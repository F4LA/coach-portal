"use client";

import { useEffect, useMemo, useState } from "react";
import { getCachedBody, setCachedBody } from "@/lib/clientCache";
import { fmtMoney } from "@/lib/coach";
import type { CoachClient } from "@/lib/mastersheet";
import { nextSlips } from "@/lib/payroll";
import type { PayrollSlip } from "@/lib/payroll";

const ALL_COACHES = "__all__";
const UPCOMING_COUNT = 3;
const GREEN = "var(--success)";
const PURPLE = "#B07CD8";

function fmtDate(d: Date | string): string {
  const date = typeof d === "string" ? (() => { const [y, m, day] = d.split("-").map(Number); return new Date(y, m - 1, day); })() : d;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function SectionHeader({ title, color, count, cents }: { title: string; color: string; count: number; cents: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", padding: "14px 18px", borderLeft: `3px solid ${color}`, borderBottom: "1px solid var(--steel-a-15)" }}>
      <div style={{ fontFamily: "var(--font-display)", fontSize: 20, letterSpacing: "0.06em", color }}>{title}</div>
      <div className="label" style={{ color }}>{count} CLIENT{count === 1 ? "" : "S"} · {fmtMoney(cents)}</div>
    </div>
  );
}

const th: React.CSSProperties = { textAlign: "left", padding: "10px 18px", fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", color: "var(--fg-4)", whiteSpace: "nowrap", borderBottom: "1px solid var(--steel-a-15)" };
const td: React.CSSProperties = { padding: "11px 18px", fontSize: 13, color: "var(--fg-2)", whiteSpace: "nowrap", borderBottom: "1px solid rgba(138,155,176,0.08)" };

function SlipDetail({ slip, baseSalaryCents, showCoach }: { slip: PayrollSlip; baseSalaryCents: number; showCoach: boolean }) {
  const total = slip.activeCents + slip.retentionCents + baseSalaryCents;
  const lines = [
    { label: "Active Client Pay", cents: slip.activeCents, color: GREEN },
    { label: "Retention Commission", cents: slip.retentionCents, color: PURPLE },
    { label: "Base Salary", cents: baseSalaryCents, color: "var(--fg-1)" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", borderBottom: "1px solid var(--steel-a-15)" }}>
          {[
            ["PAY DATE", fmtDate(slip.payDate)],
            ["PERIOD START", fmtDate(slip.periodStart)],
            ["PERIOD END", fmtDate(slip.periodEnd)],
          ].map(([label, value]) => (
            <div key={label} style={{ padding: "14px 18px" }}>
              <div className="label" style={{ color: "var(--fg-4)" }}>{label}</div>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 18, color: "var(--fg-1)", marginTop: 4 }}>{value}</div>
            </div>
          ))}
        </div>
        <div style={{ padding: "8px 18px 16px" }}>
          <div className="label" style={{ color: "var(--fg-4)", padding: "10px 0 4px" }}>PAYMENT BREAKDOWN</div>
          {lines.map((l) => (
            <div key={l.label} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid rgba(138,155,176,0.10)" }}>
              <span style={{ fontSize: 14, color: "var(--fg-2)" }}>{l.label}</span>
              <span style={{ fontFamily: "var(--font-display)", fontSize: 18, color: l.color }}>{fmtMoney(l.cents)}</span>
            </div>
          ))}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 14 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: "var(--fg-1)" }}>Total Payment</span>
            <span style={{ fontFamily: "var(--font-display)", fontSize: 30, color: "var(--steel-400)" }}>{fmtMoney(total)}</span>
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <SectionHeader title="ACTIVE CLIENTS" color={GREEN} count={slip.active.length} cents={slip.activeCents} />
        {slip.active.length === 0 ? (
          <div style={{ padding: 18, fontSize: 13, color: "var(--fg-4)" }}>No active clients this period</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={th}>CLIENT</th>
                  {showCoach && <th style={th}>COACH</th>}
                  <th style={th}>PRODUCT</th>
                  <th style={th}>START DATE</th>
                  <th style={th}>END DATE</th>
                  <th style={{ ...th, textAlign: "right" }}>COACH PAY</th>
                </tr>
              </thead>
              <tbody>
                {slip.active.map((r, i) => (
                  <tr key={`${r.clientName}-${r.contractStart}-${i}`}>
                    <td style={{ ...td, color: "var(--fg-1)", fontWeight: 500 }}>{r.clientName}</td>
                    {showCoach && <td style={td}>{r.coachName}</td>}
                    <td style={td}>{r.product || "—"}</td>
                    <td style={td}>{fmtDate(r.contractStart)}</td>
                    <td style={td}>{fmtDate(r.contractEnd)}</td>
                    <td style={{ ...td, textAlign: "right", fontFamily: "var(--font-display)", fontSize: 16, color: GREEN }}>{fmtMoney(r.coachPayCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <SectionHeader title="RETENTION COMMISSION" color={PURPLE} count={slip.retention.length} cents={slip.retentionCents} />
        {slip.retention.length === 0 ? (
          <div style={{ padding: 18, fontSize: 13, color: "var(--fg-4)" }}>No retention commissions this period</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={th}>CLIENT</th>
                  {showCoach && <th style={th}>COACH</th>}
                  <th style={th}>START DATE</th>
                  <th style={th}>END DATE</th>
                  <th style={th}>STATUS</th>
                  <th style={{ ...th, textAlign: "right" }}>COMMISSION</th>
                </tr>
              </thead>
              <tbody>
                {slip.retention.map((r, i) => (
                  <tr key={`${r.clientName}-${r.contractStart}-${i}`}>
                    <td style={{ ...td, color: "var(--fg-1)", fontWeight: 500 }}>{r.clientName}</td>
                    {showCoach && <td style={td}>{r.coachName}</td>}
                    <td style={td}>{fmtDate(r.contractStart)}</td>
                    <td style={td}>{fmtDate(r.contractEnd)}</td>
                    <td style={td}>
                      <span style={{ fontSize: 11, padding: "2px 10px", borderRadius: 9999, border: `1px solid ${PURPLE}`, color: PURPLE }}>Resign</span>
                    </td>
                    <td style={{ ...td, textAlign: "right", fontFamily: "var(--font-display)", fontSize: 16, color: PURPLE }}>{fmtMoney(r.commissionCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export function PayoutsScreen() {
  const [clients, setClients] = useState<CoachClient[] | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [coachNames, setCoachNames] = useState<string[]>([]);
  const [viewAs, setViewAs] = useState(ALL_COACHES);
  const [error, setError] = useState<string | null>(null);
  const [baseSalaryCents, setBaseSalaryCents] = useState(0);
  const [selected, setSelected] = useState(0);

  useEffect(() => {
    setError(null);
    const qs = viewAs === ALL_COACHES ? "" : `?coach=${encodeURIComponent(viewAs)}`;
    const url = `/api/roster${qs}`;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const apply = (body: any) => {
      setClients(body.clients);
      setIsAdmin(body.isAdmin);
      if (body.coachNames) setCoachNames(body.coachNames);
      setBaseSalaryCents(body.baseSalaryCents ?? 0);
    };
    const hit = getCachedBody(url);
    if (hit) apply(hit);
    else setClients(null);
    fetch(url)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || "Failed to load.");
        setCachedBody(url, body);
        apply(body);
      })
      .catch((e) => { if (!hit) setError(e.message); });
  }, [viewAs]);

  const slips = useMemo(() => nextSlips(clients ?? [], UPCOMING_COUNT), [clients]);
  const current = slips[selected] ?? slips[0];
  const showCoach = isAdmin && viewAs === ALL_COACHES;

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
          <div>
            <div className="label" style={{ color: "var(--fg-4)", marginBottom: 10 }}>NEXT {UPCOMING_COUNT} PAYOUTS</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16 }}>
              {slips.map((s, i) => {
                const isSel = s === current;
                const count = new Set([...s.active, ...s.retention].map((r) => `${r.clientName}|${r.contractStart}`)).size;
                return (
                  <button
                    key={s.payKey}
                    onClick={() => setSelected(i)}
                    className={isSel ? "card-featured" : "card"}
                    style={{ padding: 22, textAlign: "left", cursor: "pointer", font: "inherit", color: "inherit", outline: isSel ? "1px solid var(--steel-400)" : "none" }}
                  >
                    <div className="label" style={{ color: isSel ? "var(--fg-3)" : "var(--fg-4)" }}>
                      {s.payDate.toLocaleDateString("en-US", { month: "long", year: "numeric" }).toUpperCase()}
                    </div>
                    <div style={{ fontFamily: "var(--font-display)", fontSize: isSel ? 34 : 28, color: "var(--fg-1)", marginTop: 8 }}>
                      {fmtMoney(s.activeCents + s.retentionCents + baseSalaryCents)}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--fg-4)", marginTop: 4 }}>
                      {count > 0 ? `${count} client${count === 1 ? "" : "s"} · ` : ""}for {s.periodLabel} coaching
                    </div>
                    <div style={{ fontSize: 11, color: isSel ? "var(--steel-400)" : "var(--fg-4)", marginTop: 10 }}>
                      {isSel ? "Showing breakdown below" : "View breakdown"}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {current && <SlipDetail slip={current} baseSalaryCents={baseSalaryCents} showCoach={showCoach} />}
        </>
      )}
    </div>
  );
}
