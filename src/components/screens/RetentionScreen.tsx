"use client";

import { useEffect, useMemo, useState } from "react";
import type { RetentionClient, RetentionStatus } from "@/lib/retention";
import { RETENTION_STATUSES } from "@/lib/retention";

const ALL_COACHES = "__all__";

function fmtDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function endLabel(contractEnd: string): { text: string; urgent: boolean } {
  const [y, m, d] = contractEnd.split("-").map(Number);
  const end = new Date(y, m - 1, d);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.round((end.getTime() - today.getTime()) / 86400000);
  if (diffDays > 0) return { text: `ends in ${diffDays} day${diffDays === 1 ? "" : "s"}`, urgent: diffDays <= 14 };
  if (diffDays === 0) return { text: "ends today", urgent: true };
  return { text: `ended ${Math.abs(diffDays)} day${Math.abs(diffDays) === 1 ? "" : "s"} ago`, urgent: false };
}

function statusColor(status: RetentionStatus) {
  switch (status) {
    case "Renewed":
      return "var(--success)";
    case "Did Not Renew - Call Done":
      return "var(--warning)";
    case "MIA":
      return "var(--warning)";
    case "":
      return "var(--fg-4)";
    default:
      return "var(--gold)";
  }
}

function RetentionRow({ client, showCoach }: { client: RetentionClient; showCoach: boolean }) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<RetentionStatus>(client.retentionStatus);
  const [program, setProgram] = useState(client.retentionProgram);
  const [notes, setNotes] = useState(client.retentionNotes);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (next: { status?: RetentionStatus; program?: string; notes?: string }) => {
    setSaving(true);
    setError(null);
    setJustSaved(false);
    try {
      const res = await fetch("/api/retention", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: client.firstName,
          lastName: client.lastName,
          email: client.email,
          contractStart: client.contractStart,
          contractEnd: client.contractEnd,
          coachName: client.coachName,
          retentionStatus: next.status ?? status,
          retentionProgram: next.program ?? program,
          retentionNotes: next.notes ?? notes,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Couldn't save.");
      setJustSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save.");
    } finally {
      setSaving(false);
    }
  };

  const end = endLabel(client.contractEnd);

  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.4fr 0.9fr 1fr auto",
          gap: 12,
          alignItems: "center",
          padding: "16px 22px",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14, color: "var(--fg-1)", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {client.clientName}
            {showCoach && <span className="label" style={{ color: "var(--steel-400)" }}>{client.coachName.toUpperCase()}</span>}
          </div>
          <div style={{ fontSize: 12, color: "var(--fg-4)" }}>{client.product}</div>
        </div>
        <div style={{ fontSize: 13, color: "var(--fg-3)" }}>
          {fmtDate(client.contractStart)} – {fmtDate(client.contractEnd)}
        </div>
        <div style={{ fontSize: 13, color: end.urgent ? "var(--gold)" : "var(--fg-4)" }}>{end.text}</div>
        <select
          className="field"
          value={status}
          onChange={(e) => {
            const value = e.target.value as RetentionStatus;
            setStatus(value);
            save({ status: value });
          }}
          style={{ padding: "9px 12px", fontSize: 13, color: statusColor(status), minWidth: 220 }}
        >
          <option value="">— Not set —</option>
          {RETENTION_STATUSES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          width: "100%",
          padding: "8px 22px",
          background: "none",
          border: "none",
          borderTop: "1px solid var(--steel-a-08)",
          color: "var(--fg-4)",
          fontSize: 12,
          textAlign: "left",
          cursor: "pointer",
        }}
      >
        {open ? "▾ Hide program & notes" : "▸ Program & notes"}
        {saving && " · saving…"}
        {justSaved && !saving && " · saved"}
        {error && <span style={{ color: "var(--warning)" }}> · {error}</span>}
      </button>

      {open && (
        <div style={{ padding: "0 22px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <div className="label" style={{ color: "var(--fg-4)" }}>PROGRAM</div>
            <select
              className="field"
              value={program}
              onChange={(e) => setProgram(e.target.value)}
              style={{ padding: "8px 12px", fontSize: 13, maxWidth: 160 }}
            >
              <option value="">—</option>
              <option value="1on1">1on1</option>
              <option value="GC">GC</option>
            </select>
          </div>
          <div>
            <div className="label" style={{ color: "var(--fg-4)", marginBottom: 6 }}>NOTES</div>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="field"
              style={{ width: "100%", padding: "10px 12px", fontSize: 13, resize: "vertical" }}
            />
          </div>
          <button
            onClick={() => save({})}
            disabled={saving}
            className="field"
            style={{ alignSelf: "flex-start", padding: "8px 18px", fontSize: 13, cursor: "pointer" }}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      )}
    </div>
  );
}

export function RetentionScreen() {
  const [clients, setClients] = useState<RetentionClient[] | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [coachNames, setCoachNames] = useState<string[]>([]);
  const [viewAs, setViewAs] = useState(ALL_COACHES);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    setClients(null);
    setError(null);
    const qs = viewAs === ALL_COACHES ? "" : `?coach=${encodeURIComponent(viewAs)}`;
    fetch(`/api/retention${qs}`)
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
    if (!q) return clients;
    return clients.filter((c) => c.clientName.toLowerCase().includes(q) || c.email.toLowerCase().includes(q));
  }, [clients, query]);

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
              filtered.map((c, i) => (
                <RetentionRow
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
