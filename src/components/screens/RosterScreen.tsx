"use client";

import { useEffect, useMemo, useState } from "react";
import { fmtMoney } from "@/lib/coach";
import type { CoachClient } from "@/lib/mastersheet";

function fmtDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function ClientRow({ client }: { client: CoachClient }) {
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
            <div><span className="label" style={{ color: "var(--fg-4)" }}>PACKAGE</span> {fmtMoney(client.packageCents)}</div>
            <div><span className="label" style={{ color: "var(--fg-4)" }}>EMAIL</span> {client.email}</div>
            {client.isRefunded && client.refundDate && (
              <div style={{ color: "var(--warning)" }}>
                <span className="label" style={{ color: "var(--warning)" }}>REFUNDED</span> {client.refundDate} — coaching may have ended early; months below are the original schedule.
              </div>
            )}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10, marginTop: 16 }}>
            {client.payoutMonths.map((m, i) => (
              <div
                key={i}
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

export function RosterScreen() {
  const [clients, setClients] = useState<CoachClient[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    fetch("/api/roster")
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || "Failed to load.");
        setClients(body.clients);
      })
      .catch((e) => setError(e.message));
  }, []);

  const filtered = useMemo(() => {
    if (!clients) return [];
    const q = query.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter((c) => c.clientName.toLowerCase().includes(q) || c.email.toLowerCase().includes(q));
  }, [clients, query]);

  const totals = useMemo(() => {
    const list = clients ?? [];
    const active = list.filter((c) => c.payoutMonths.some((m) => !m.paid));
    return {
      totalClients: list.length,
      activeClients: active.length,
      totalPaidCents: list.reduce((sum, c) => sum + c.totalPaidSoFarCents, 0),
      monthlyRunRateCents: active.reduce((sum, c) => sum + c.coachPayCents, 0),
    };
  }, [clients]);

  if (error) return <p style={{ color: "var(--warning)" }}>{error}</p>;
  if (clients === null) return <p style={{ color: "var(--fg-4)" }}>Loading…</p>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16 }}>
        <div className="card-featured" style={{ padding: 22 }}>
          <div className="label" style={{ color: "var(--fg-3)" }}>PAID TO DATE</div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 34, color: "var(--fg-1)", marginTop: 8 }}>
            {fmtMoney(totals.totalPaidCents)}
          </div>
        </div>
        <div className="card" style={{ padding: 22 }}>
          <div className="label" style={{ color: "var(--fg-4)" }}>MONTHLY RUN RATE</div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 28, color: "var(--fg-1)", marginTop: 8 }}>
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

      <input
        className="field"
        placeholder="Search by name or email…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        style={{ maxWidth: 340, padding: "11px 16px" }}
      />

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {filtered.length === 0 ? (
          <p style={{ color: "var(--fg-4)" }}>No clients match.</p>
        ) : (
          filtered.map((c, i) => <ClientRow key={`${c.email}-${c.contractStart}-${i}`} client={c} />)
        )}
      </div>
    </div>
  );
}
