"use client";

import { useEffect, useMemo, useState } from "react";
import { fmtMoney } from "@/lib/coach";
import type { CoachClient } from "@/lib/mastersheet";

function fmtDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function ClientRow({ client, showCoach }: { client: CoachClient; showCoach: boolean }) {
  const [open, setOpen] = useState(false);
  const monthsPaid = client.payoutMonths.filter((m) => m.paid).length;
  const isComplete = monthsPaid >= client.durationMonths;

  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      <button
        className="roster-row"
        onClick={() => setOpen((o) => !o)}
        style={{
          width: "100%",
          display: "grid",
          gridTemplateColumns: "1.4fr 0.9fr 1fr 0.8fr 0.9fr auto",
          gap: 12,
          alignItems: "center",
          padding: "16px 22px",
          background: "none",
          border: "none",
          cursor: "pointer",
          textAlign: "left",
          color: "inherit",
          font: "inherit",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14, color: "var(--fg-1)", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {client.clientName}
            {showCoach && (
              <span className="label" style={{ color: "var(--steel-400)" }}>{client.coachName.toUpperCase()}</span>
            )}
            {client.newOrResign === "Resign" && (
              <span className="label" style={{ color: "var(--gold)" }}>RESIGN</span>
            )}
            {client.isRefunded && (
              <span className="label" style={{ color: "var(--warning)" }}>REFUNDED</span>
            )}
          </div>
          <div style={{ fontSize: 12, color: "var(--fg-4)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {client.product} · Tier {client.tier}
          </div>
        </div>
        <div style={{ fontSize: 13, color: "var(--fg-3)" }}>
          {fmtDate(client.contractStart)} – {fmtDate(client.contractEnd)}
        </div>
        <div style={{ fontSize: 13, color: "var(--fg-3)" }}>
          {fmtMoney(client.coachPayCents)}/mo · {client.durationMonths} mo
        </div>
        <div style={{ fontSize: 13, color: isComplete ? "var(--success)" : "var(--fg-1)" }}>
          {monthsPaid} / {client.durationMonths} paid
        </div>
        <div style={{ fontSize: 14, color: "var(--fg-1)", fontFamily: "var(--font-display)" }}>
          {fmtMoney(client.totalPaidSoFarCents)}
        </div>
        <span style={{ color: "var(--fg-4)", transform: open ? "rotate(180deg)" : "none", transition: "transform 150ms" }}>▾</span>
      </button>

      {open && (
        <div style={{ padding: "0 22px 20px", borderTop: "1px solid var(--steel-a-08)" }}>
          <div style={{ display: "flex", gap: 24, marginTop: 16, flexWrap: "wrap", fontSize: 13, color: "var(--fg-3)" }}>
            <div><span className="label" style={{ color: "var(--fg-4)" }}>EMAIL</span> {client.email}</div>
            {client.isRefunded && client.refundDate && (
              <div style={{ color: "var(--warning)" }}>
                <span className="label" style={{ color: "var(--warning)" }}>REFUNDED</span> {client.refundDate} — coaching may have ended early; months below are the original schedule.
              </div>
            )}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10, marginTop: 16 }}>
            {client.payoutMonths.map((m) => (
              <div
                key={m.key}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "10px 14px",
                  borderRadius: "var(--radius-input)",
                  background: m.paid ? "var(--navy-700)" : "var(--navy-800)",
                  border: `1px solid ${m.paid ? "var(--steel-a-30)" : "var(--steel-a-08)"}`,
                }}
              >
                <span style={{ fontSize: 13, color: m.paid ? "var(--fg-1)" : "var(--fg-4)" }}>{m.label}</span>
                <span style={{ fontSize: 11, color: m.paid ? "var(--success)" : "var(--fg-4)" }}>
                  {m.paid ? "✓ paid" : "upcoming"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const ALL_COACHES = "__all__";

type SortKey = "name-asc" | "name-desc" | "end-asc" | "end-desc";

const SORTERS: Record<SortKey, (a: CoachClient, b: CoachClient) => number> = {
  "name-asc": (a, b) => a.clientName.localeCompare(b.clientName),
  "name-desc": (a, b) => b.clientName.localeCompare(a.clientName),
  "end-asc": (a, b) => (a.contractEnd < b.contractEnd ? -1 : a.contractEnd > b.contractEnd ? 1 : 0),
  "end-desc": (a, b) => (a.contractEnd > b.contractEnd ? -1 : a.contractEnd < b.contractEnd ? 1 : 0),
};

export function RosterScreen() {
  const [clients, setClients] = useState<CoachClient[] | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [coachNames, setCoachNames] = useState<string[]>([]);
  const [viewAs, setViewAs] = useState(ALL_COACHES);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("end-asc");
  const [onlyPending, setOnlyPending] = useState(false);

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

  const filtered = useMemo(() => {
    if (!clients) return [];
    const q = query.trim().toLowerCase();
    let list = clients;
    if (q) {
      list = list.filter((c) => c.clientName.toLowerCase().includes(q) || c.email.toLowerCase().includes(q));
    }
    if (onlyPending) {
      list = list.filter((c) => c.payoutMonths.some((m) => !m.paid));
    }
    return [...list].sort(SORTERS[sortBy]);
  }, [clients, query, onlyPending, sortBy]);

  const totals = useMemo(() => {
    const list = clients ?? [];
    const active = list.filter((c) => c.payoutMonths.some((m) => !m.paid));
    return {
      totalClients: list.length,
      activeClients: active.length,
      monthlyRunRateCents: active.reduce((sum, c) => sum + c.coachPayCents, 0),
    };
  }, [clients]);

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
              <div className="label" style={{ color: "var(--fg-3)" }}>MONTHLY RUN RATE</div>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 34, color: "var(--fg-1)", marginTop: 8 }}>
                {fmtMoney(totals.monthlyRunRateCents)}
              </div>
              <div style={{ fontSize: 12, color: "var(--fg-4)", marginTop: 4 }}>from clients still active</div>
            </div>
            <div className="card" style={{ padding: 22 }}>
              <div className="label" style={{ color: "var(--fg-4)" }}>ACTIVE CLIENTS</div>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 28, color: "var(--fg-1)", marginTop: 8 }}>
                {totals.activeClients}
              </div>
            </div>
            <div className="card" style={{ padding: 22 }}>
              <div className="label" style={{ color: "var(--fg-4)" }}>TOTAL CLIENTS EVER</div>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 28, color: "var(--fg-1)", marginTop: 8 }}>
                {totals.totalClients}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
            <input
              className="field"
              placeholder="Search by name or email…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{ maxWidth: 340, padding: "11px 16px" }}
            />
            <select
              className="field"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortKey)}
              style={{ maxWidth: 220, padding: "11px 14px" }}
            >
              <option value="name-asc">Name (A–Z)</option>
              <option value="name-desc">Name (Z–A)</option>
              <option value="end-asc">End date (soonest)</option>
              <option value="end-desc">End date (latest)</option>
            </select>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--fg-3)", cursor: "pointer" }}>
              <input type="checkbox" checked={onlyPending} onChange={(e) => setOnlyPending(e.target.checked)} />
              Only clients still owed payments
            </label>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {filtered.length === 0 ? (
              <p style={{ color: "var(--fg-4)" }}>No clients match.</p>
            ) : (
              filtered.map((c, i) => (
                <ClientRow
                  key={`${c.email}-${c.contractStart}-${i}`}
                  client={c}
                  showCoach={isAdmin && viewAs === ALL_COACHES}
                />
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
