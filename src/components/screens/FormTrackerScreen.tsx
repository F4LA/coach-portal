"use client";

import { useEffect, useMemo, useState } from "react";
import { recentWeekKeys, weekKeyFor, weekWindowForKey } from "@/lib/weekWindow";
import type { ClientWeekRow } from "@/lib/formTracker";

const ALL_COACHES = "__all__";
const WEEK_HISTORY_COUNT = 12;

function ordinal(n: number): string {
  const suffixes = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${suffixes[(v - 20) % 10] || suffixes[v] || suffixes[0]}`;
}

// Rendered explicitly in ET (not the viewer's local timezone) — everything
// else about this feature (the week itself, "due" labels) is ET-framed, so a
// coach in a different timezone would otherwise see inconsistent-looking
// times relative to the week boundaries.
function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric" });
}

type FetchState = {
  window: { key: string; label: string };
  closed: boolean;
  clients: ClientWeekRow[];
  unmatchedFormClientCount: number;
  unmatchedFormClientSample: string[];
  isAdmin: boolean;
  coachNames?: string[];
};

function ClientRow({ row, showCoach, tone }: { row: ClientWeekRow; showCoach: boolean; tone: "overdue" | "pending" | "exempt" | "sent" | "never_sent" }) {
  const toneStyle: Record<typeof tone, { border: string; nameColor: string; stateColor: string; bg?: string; opacity?: number }> = {
    overdue: { border: "1px solid rgba(224,85,85,0.30)", nameColor: "var(--fg-2)", stateColor: "#F08A8A" },
    never_sent: { border: "1px solid rgba(224,85,85,0.30)", nameColor: "var(--fg-2)", stateColor: "#F08A8A" },
    pending: { border: "1px solid rgba(200,169,110,0.30)", nameColor: "var(--fg-2)", stateColor: "var(--gold)" },
    exempt: { border: "1px solid var(--steel-a-15)", nameColor: "var(--fg-2)", stateColor: "var(--steel-400)" },
    sent: { border: "1px solid rgba(34,120,172,0.10)", nameColor: "#A8B6C7", stateColor: "var(--success)", bg: "#0B1220", opacity: 0.72 },
  };
  const s = toneStyle[tone];

  let contextLine: { text: string; color: string } | null = null;
  if (row.state === "sent" || row.state === "exempt") {
    contextLine = row.timestampIso ? { text: fmtDateTime(row.timestampIso), color: "var(--fg-3)" } : null;
  } else if (row.consecutiveMisses >= 2) {
    contextLine = { text: `${ordinal(row.consecutiveMisses)} week in a row`, color: "#F08A8A" };
  } else if (row.lastSubmittedIso) {
    contextLine = { text: `Last submitted ${fmtDate(row.lastSubmittedIso)}`, color: "var(--fg-3)" };
  } else {
    contextLine = { text: "No submissions on record", color: "var(--fg-3)" };
  }

  const stateLabel =
    row.state === "sent" ? "Sent" :
    row.state === "exempt" ? "Exempt" :
    row.state === "never_sent" ? "Never Sent" :
    tone === "overdue" ? "Overdue" : "Pending";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 18px",
        background: s.bg ?? "#0D1526",
        border: s.border,
        borderRadius: 10,
        opacity: s.opacity ?? 1,
      }}
    >
      <div style={{ flexGrow: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, color: s.nameColor, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {row.clientName}
          {showCoach && <span className="label" style={{ color: "var(--steel-400)", marginLeft: 8 }}>{row.coachName.toUpperCase()}</span>}
        </div>
        {contextLine && (
          <div style={{ fontSize: 12, color: contextLine.color, marginTop: 2 }}>{contextLine.text}</div>
        )}
      </div>
      {row.checkInDay && (
        <div style={{ padding: "3px 9px", background: "#111C30", border: "1px solid rgba(138,155,176,0.22)", borderRadius: 9999, fontSize: 11, color: "#A8B6C7", whiteSpace: "nowrap" }}>
          Checks in {row.checkInDay}
        </div>
      )}
      <div style={{ width: 100, flexShrink: 0, textAlign: "right", fontSize: 12, color: row.dueLabel ? (row.dueLabel.kind === "overdue" ? "#F08A8A" : "var(--fg-3)") : s.stateColor, whiteSpace: "nowrap" }}>
        {row.dueLabel ? row.dueLabel.label : stateLabel}
      </div>
    </div>
  );
}

function GroupHeader({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "18px 0 8px" }}>
      <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase", color }}>{label}</span>
      <span style={{ fontSize: 11, color: "var(--fg-4)" }}>{count}</span>
      <div style={{ flexGrow: 1, height: 1, background: "var(--steel-a-08)" }} />
    </div>
  );
}

function SegmentedBar({ sent, exempt, total }: { sent: number; exempt: number; total: number }) {
  const sentPct = total > 0 ? (sent / total) * 100 : 0;
  const exemptPct = total > 0 ? (exempt / total) * 100 : 0;
  return (
    <div style={{ display: "flex", height: 8, borderRadius: 9999, overflow: "hidden", background: "var(--navy-700)" }}>
      <div style={{ width: `${sentPct}%`, background: "var(--success)" }} />
      <div style={{ width: `${exemptPct}%`, background: "var(--steel-400)" }} />
    </div>
  );
}

function CoachView({ data, showCoach }: { data: FetchState; showCoach: boolean }) {
  const [sentExpanded, setSentExpanded] = useState(false);

  const total = data.clients.length;
  const sent = data.clients.filter((c) => c.state === "sent").length;
  const exempt = data.clients.filter((c) => c.state === "exempt").length;
  const completed = sent + exempt;
  const pendingCount = data.clients.filter((c) => c.state === "pending").length;
  const neverSentCount = data.clients.filter((c) => c.state === "never_sent").length;

  const overdueRows = data.clients.filter((c) => !data.closed && c.state === "pending" && c.dueLabel?.kind === "overdue");
  const pendingRows = data.clients.filter((c) => !data.closed && c.state === "pending" && c.dueLabel?.kind !== "overdue");
  const neverSentRows = data.clients.filter((c) => data.closed && c.state === "never_sent");
  const exemptRows = data.clients.filter((c) => c.state === "exempt");
  const sentRows = data.clients.filter((c) => c.state === "sent");

  const now = new Date();
  const window = weekWindowForKey(data.window.key);
  const daysLeft = Math.max(0, Math.ceil((window.end.getTime() - now.getTime()) / 86400000));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
        <div />
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 13, color: "var(--fg-2)" }}>{data.window.label}</div>
          {data.closed ? (
            <span style={{ display: "inline-block", marginTop: 4, fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", padding: "2px 8px", borderRadius: 9999, background: "rgba(138,155,176,0.12)", color: "#A8B6C7", border: "1px solid rgba(138,155,176,0.25)" }}>CLOSED</span>
          ) : (
            <div style={{ fontSize: 12, color: "var(--gold)", marginTop: 2 }}>Week closes in {daysLeft} day{daysLeft === 1 ? "" : "s"}</div>
          )}
        </div>
      </div>

      {data.closed && neverSentCount > 0 && (
        <div style={{ background: "rgba(224,85,85,0.06)", border: "1px solid rgba(224,85,85,0.30)", borderRadius: 10, padding: "12px 16px", fontSize: 13, color: "#F08A8A" }}>
          ⚠ {neverSentCount} client{neverSentCount === 1 ? "" : "s"} finished the week with no form submitted.
        </div>
      )}

      <div className="card" style={{ padding: 22 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <span style={{ fontFamily: "var(--font-display)", fontSize: 40, color: "var(--fg-1)" }}>{completed}</span>
          <span style={{ fontSize: 22, color: "var(--fg-3)" }}>/ {total}</span>
        </div>
        <div style={{ fontSize: 13, color: "var(--fg-3)", marginTop: -4 }}>submitted this week</div>
        <div style={{ marginTop: 14 }}>
          <SegmentedBar sent={sent} exempt={exempt} total={total} />
        </div>
        <div style={{ display: "flex", gap: 16, marginTop: 10, fontSize: 12, color: "var(--fg-3)", flexWrap: "wrap" }}>
          <span><span style={{ color: "var(--success)" }}>●</span> {sent} sent</span>
          <span><span style={{ color: "var(--steel-400)" }}>●</span> {exempt} exempt</span>
          <span><span style={{ color: "var(--fg-4)" }}>●</span> {data.closed ? neverSentCount : pendingCount} {data.closed ? "never sent" : "pending"}</span>
        </div>
      </div>

      {overdueRows.length > 0 && (
        <div>
          <GroupHeader label="Overdue" count={overdueRows.length} color="var(--warning)" />
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {overdueRows.map((r, i) => <ClientRow key={`${r.clientName}-${i}`} row={r} showCoach={showCoach} tone="overdue" />)}
          </div>
        </div>
      )}

      {!data.closed && (
        <div>
          <GroupHeader label="Pending" count={pendingRows.length} color="var(--gold)" />
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {pendingRows.length === 0 ? <p style={{ color: "var(--fg-4)", fontSize: 13 }}>Nobody pending.</p> :
              pendingRows.map((r, i) => <ClientRow key={`${r.clientName}-${i}`} row={r} showCoach={showCoach} tone="pending" />)}
          </div>
        </div>
      )}

      {data.closed && (
        <div>
          <GroupHeader label="Never Sent" count={neverSentRows.length} color="var(--warning)" />
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {neverSentRows.length === 0 ? <p style={{ color: "var(--fg-4)", fontSize: 13 }}>None — everyone submitted or was exempt.</p> :
              neverSentRows.map((r, i) => <ClientRow key={`${r.clientName}-${i}`} row={r} showCoach={showCoach} tone="never_sent" />)}
          </div>
        </div>
      )}

      <div>
        <GroupHeader label="Exempt" count={exemptRows.length} color="var(--steel-400)" />
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {exemptRows.length === 0 ? <p style={{ color: "var(--fg-4)", fontSize: 13 }}>No exemptions this week.</p> :
            exemptRows.map((r, i) => <ClientRow key={`${r.clientName}-${i}`} row={r} showCoach={showCoach} tone="exempt" />)}
        </div>
      </div>

      <div>
        <GroupHeader label="Sent" count={sentRows.length} color="var(--success)" />
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {(sentExpanded ? sentRows : sentRows.slice(0, 5)).map((r, i) => (
            <ClientRow key={`${r.clientName}-${i}`} row={r} showCoach={showCoach} tone="sent" />
          ))}
          {!sentExpanded && sentRows.length > 5 && (
            <button
              onClick={() => setSentExpanded(true)}
              style={{ background: "none", border: "none", color: "var(--steel-400)", fontSize: 12, textAlign: "left", cursor: "pointer", padding: "4px 4px" }}
            >
              {sentRows.length - 5} more submitted
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function HeadCoachView({ data }: { data: FetchState }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const coaches = data.coachNames ?? [];
  const summaries = useMemo(() => {
    return coaches
      .map((coach) => {
        const rows = data.clients.filter((c) => c.coachName === coach);
        const total = rows.length;
        const sent = rows.filter((c) => c.state === "sent").length;
        const exempt = rows.filter((c) => c.state === "exempt").length;
        const completed = sent + exempt;
        const pending = rows.filter((c) => c.state === "pending" || c.state === "never_sent");
        return { coach, total, sent, exempt, completed, pct: total > 0 ? completed / total : 1, pending };
      })
      .sort((a, b) => a.pct - b.pct);
  }, [coaches, data.clients]);

  const allTotal = data.clients.length;
  const allSent = data.clients.filter((c) => c.state === "sent").length;
  const allExempt = data.clients.filter((c) => c.state === "exempt").length;
  const allCompleted = allSent + allExempt;

  const toggle = (coach: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(coach)) next.delete(coach); else next.add(coach);
      return next;
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ fontSize: 12, color: "var(--fg-3)", marginBottom: 4 }}>{data.window.label}{data.closed ? " · CLOSED" : ""}</div>
      {summaries.map((s) => (
        <div key={s.coach} className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "12px 18px" }}>
            <button
              onClick={() => toggle(s.coach)}
              style={{ flexShrink: 0, width: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "1px solid rgba(34,120,172,0.25)", borderRadius: 7, color: "var(--fg-3)", cursor: "pointer" }}
            >
              <span style={{ transform: expanded.has(s.coach) ? "rotate(90deg)" : "none", transition: "transform 150ms", display: "inline-block" }}>▸</span>
            </button>
            <div style={{ width: 110, flexShrink: 0, fontSize: 14, color: "var(--fg-1)" }}>{s.coach}</div>
            <div style={{ flexGrow: 1 }}><SegmentedBar sent={s.sent} exempt={s.exempt} total={s.total} /></div>
            <div style={{ width: 90, flexShrink: 0, textAlign: "right", fontSize: 14, color: "var(--fg-1)" }}>{s.completed} / {s.total}</div>
            <div style={{ width: 110, flexShrink: 0, textAlign: "right", fontSize: 12, color: "var(--gold)" }}>{s.pending.length} pending</div>
          </div>
          {expanded.has(s.coach) && (
            <div style={{ padding: "0 18px 16px 60px", display: "flex", flexWrap: "wrap", gap: 8 }}>
              {s.pending.length === 0 ? (
                <p style={{ color: "var(--fg-4)", fontSize: 13 }}>Nothing pending.</p>
              ) : (
                s.pending.map((c, i) => (
                  <span
                    key={`${c.clientName}-${i}`}
                    style={{
                      padding: "5px 11px",
                      background: "#111C30",
                      border: c.dueLabel?.kind === "overdue" || c.state === "never_sent" ? "1px solid rgba(224,85,85,0.40)" : "1px solid rgba(200,169,110,0.30)",
                      borderRadius: 9999,
                      fontSize: 12,
                      color: c.dueLabel?.kind === "overdue" || c.state === "never_sent" ? "#F08A8A" : "var(--fg-2)",
                    }}
                  >
                    {c.clientName}
                  </span>
                ))
              )}
            </div>
          )}
        </div>
      ))}

      <div className="card" style={{ padding: "12px 18px", display: "flex", alignItems: "center", gap: 16, background: "rgba(34,120,172,0.08)", border: "1px solid rgba(34,120,172,0.25)", marginTop: 8 }}>
        <div style={{ width: 26, flexShrink: 0 }} />
        <div style={{ width: 110, flexShrink: 0, fontSize: 14, color: "var(--fg-1)" }}>All coaches</div>
        <div style={{ flexGrow: 1 }}><SegmentedBar sent={allSent} exempt={allExempt} total={allTotal} /></div>
        <div style={{ width: 90, flexShrink: 0, textAlign: "right", fontSize: 14, color: "var(--fg-1)" }}>{allCompleted} / {allTotal}</div>
        <div style={{ width: 110 }} />
      </div>
    </div>
  );
}

export function FormTrackerScreen() {
  const [weekKey, setWeekKey] = useState(() => weekKeyFor(new Date()));
  const [viewAs, setViewAs] = useState(ALL_COACHES);
  const [data, setData] = useState<FetchState | null>(null);
  const [error, setError] = useState<string | null>(null);

  const weekOptions = useMemo(() => {
    const now = new Date();
    const currentKey = weekKeyFor(now);
    return recentWeekKeys(now, WEEK_HISTORY_COUNT).map((key) => {
      const w = weekWindowForKey(key);
      const isCurrent = key === currentKey;
      return { key, label: `${w.label}${isCurrent ? " (current)" : " (closed)"}` };
    });
  }, []);

  useEffect(() => {
    setData(null);
    setError(null);
    const qs = new URLSearchParams({ week: weekKey });
    if (viewAs !== ALL_COACHES) qs.set("coach", viewAs);
    fetch(`/api/form-tracker?${qs.toString()}`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || "Failed to load.");
        setData(body);
      })
      .catch((e) => setError(e.message));
  }, [weekKey, viewAs]);

  if (error) return <p style={{ color: "var(--warning)" }}>{error}</p>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <select
          className="field"
          value={weekKey}
          onChange={(e) => setWeekKey(e.target.value)}
          style={{ maxWidth: 280, padding: "9px 14px" }}
        >
          {weekOptions.map((w) => (
            <option key={w.key} value={w.key}>{w.label}</option>
          ))}
        </select>

        {data?.isAdmin && (
          <>
            <div className="label" style={{ color: "var(--fg-4)" }}>VIEWING AS</div>
            <select
              className="field"
              value={viewAs}
              onChange={(e) => setViewAs(e.target.value)}
              style={{ maxWidth: 220, padding: "9px 14px" }}
            >
              <option value={ALL_COACHES}>All coaches</option>
              {(data.coachNames ?? []).map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </>
        )}
      </div>

      {data === null ? (
        <p style={{ color: "var(--fg-4)" }}>Loading…</p>
      ) : data.isAdmin && viewAs === ALL_COACHES ? (
        <>
          {data.unmatchedFormClientCount > 0 && (
            <div style={{ fontSize: 12, color: "var(--fg-4)" }}>
              {data.unmatchedFormClientCount} form submission name{data.unmatchedFormClientCount === 1 ? "" : "s"} never matched an active client (all-time) — e.g. {data.unmatchedFormClientSample.slice(0, 3).join(", ")}.
            </div>
          )}
          <HeadCoachView data={data} />
        </>
      ) : (
        <CoachView data={data} showCoach={false} />
      )}
    </div>
  );
}
