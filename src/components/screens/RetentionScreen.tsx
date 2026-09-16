"use client";

import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import type { RetentionClient, RetentionStatus } from "@/lib/retention";
import { RETENTION_STATUSES } from "@/lib/retention";
import { setLeaveGuard } from "@/lib/navGuard";

const ALL_COACHES = "__all__";

// ---------- pure helpers (display-only — none of this touches how data is
// fetched, matched, or persisted) ----------

type ContractState = "FUTURE" | "ACTIVE" | "CLOSED";

function parseIso(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function fmtDate(iso: string) {
  return parseIso(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function contractState(start: string, end: string, today: Date): ContractState {
  const s = parseIso(start);
  const e = parseIso(end);
  if (s.getTime() > today.getTime()) return "FUTURE";
  if (e.getTime() < today.getTime()) return "CLOSED";
  return "ACTIVE";
}

const UNRESOLVED = new Set<RetentionStatus>(["", "Call Scheduled", "No Decision - No Call Scheduled"]);
function isUnresolved(status: RetentionStatus): boolean {
  return UNRESOLVED.has(status);
}

function needsAction(state: ContractState, status: RetentionStatus): boolean {
  return state === "CLOSED" && isUnresolved(status);
}

function dayDiff(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / 86400000);
}

function relativeLabel(state: ContractState, start: string, end: string, today: Date): { text: string; color: string } {
  if (state === "FUTURE") {
    const days = dayDiff(parseIso(start), today);
    return { text: `starts in ${days} day${days === 1 ? "" : "s"}`, color: "var(--fg-3)" };
  }
  if (state === "CLOSED") {
    const days = dayDiff(today, parseIso(end));
    return { text: `ended ${days} day${days === 1 ? "" : "s"} ago`, color: "var(--fg-3)" };
  }
  const days = dayDiff(parseIso(end), today);
  let color = "var(--fg-3)";
  if (days <= 7) color = "var(--warning)";
  else if (days <= 30) color = "var(--gold)";
  return { text: days === 0 ? "ends today" : `ends in ${days} day${days === 1 ? "" : "s"}`, color };
}

const STATE_BADGE: Record<ContractState, { color: string; bg: string; border: string }> = {
  FUTURE: { color: "var(--steel-400)", bg: "rgba(56,153,204,0.12)", border: "rgba(56,153,204,0.30)" },
  ACTIVE: { color: "var(--success)", bg: "rgba(61,214,140,0.12)", border: "rgba(61,214,140,0.28)" },
  CLOSED: { color: "#A8B6C7", bg: "rgba(138,155,176,0.12)", border: "rgba(138,155,176,0.25)" },
};

function statusColor(status: RetentionStatus, flaggedNeedsAction: boolean): { color: string; border: string } {
  if (status === "") {
    return flaggedNeedsAction
      ? { color: "#F08A8A", border: "rgba(224,85,85,0.40)" }
      : { color: "var(--fg-3)", border: "var(--steel-a-15)" };
  }
  if (status === "Renewed") return { color: "var(--success)", border: "rgba(61,214,140,0.30)" };
  if (status === "Pending Decision - Call Done" || status === "Call Scheduled" || status === "No Decision - No Call Scheduled") {
    return { color: "var(--gold)", border: "rgba(200,169,110,0.35)" };
  }
  // Did Not Renew - Call Done, MIA
  return { color: "#A8B6C7", border: "rgba(138,155,176,0.30)" };
}

function StateBadge({ state }: { state: ContractState }) {
  const s = STATE_BADGE[state];
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        padding: "2px 8px",
        borderRadius: 9999,
        border: `1px solid ${s.border}`,
        background: s.bg,
        color: s.color,
        whiteSpace: "nowrap",
      }}
    >
      {state}
    </span>
  );
}

function NeedsActionBadge() {
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        padding: "2px 8px",
        borderRadius: 9999,
        border: "1px solid rgba(224,85,85,0.40)",
        background: "rgba(224,85,85,0.14)",
        color: "#F08A8A",
        whiteSpace: "nowrap",
      }}
    >
      Needs action
    </span>
  );
}

function ContractCountBadge({ number, total }: { number: number; total: number }) {
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: "0.06em",
        padding: "2px 8px",
        borderRadius: 9999,
        border: "1px solid rgba(200,169,110,0.25)",
        background: "rgba(200,169,110,0.10)",
        color: "var(--gold)",
        whiteSpace: "nowrap",
      }}
    >
      Contract {number} of {total}
    </span>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 150ms" }}
    >
      <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function NoteIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth="2">
      <path d="M4 4h16v12H9l-5 5V4z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const PROGRAM_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "—" },
  { value: "1on1", label: "1:1 Coaching" },
  { value: "GC", label: "Group Coaching" },
];

function programLabel(value: string): string {
  return PROGRAM_OPTIONS.find((p) => p.value === value)?.label ?? value;
}

// ---------- row ----------

function RetentionRow({
  client,
  showCoach,
  today,
  contractBadge,
  onDirtyChange,
  onSaved,
}: {
  client: RetentionClient;
  showCoach: boolean;
  today: Date;
  contractBadge: { number: number; total: number } | null;
  onDirtyChange: (key: string, dirty: boolean) => void;
  onSaved: (key: string, next: { status: RetentionStatus; program: string; notes: string }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<RetentionStatus>(client.retentionStatus);
  const [program, setProgram] = useState(client.retentionProgram);
  const [notes, setNotes] = useState(client.retentionNotes);
  const [savedStatus, setSavedStatus] = useState(client.retentionStatus);
  const [savedProgram, setSavedProgram] = useState(client.retentionProgram);
  const [savedNotes, setSavedNotes] = useState(client.retentionNotes);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const state = contractState(client.contractStart, client.contractEnd, today);
  const flagged = needsAction(state, status);
  const rowKey = `${client.email.trim().toLowerCase()}|${client.contractStart}`;
  const dirty = status !== savedStatus || program !== savedProgram || notes !== savedNotes;
  const locked = state === "FUTURE";

  useEffect(() => {
    onDirtyChange(rowKey, dirty);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty, rowKey]);

  useEffect(() => () => { if (savedTimer.current) clearTimeout(savedTimer.current); }, []);

  const save = async () => {
    setSaving(true);
    setError(null);
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
          retentionStatus: status,
          retentionProgram: program,
          retentionNotes: notes,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Couldn't save.");
      setSavedStatus(status);
      setSavedProgram(program);
      setSavedNotes(notes);
      onSaved(rowKey, { status, program, notes });
      setJustSaved(true);
      if (savedTimer.current) clearTimeout(savedTimer.current);
      savedTimer.current = setTimeout(() => setJustSaved(false), 2200);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save.");
    } finally {
      setSaving(false);
    }
  };

  const end = relativeLabel(state, client.contractStart, client.contractEnd, today);
  const outcomeStyle = statusColor(status, flagged);
  const notePreview = client.retentionNotes ? client.retentionNotes.slice(0, 60) : "";
  const showRenewedNeedsProgram = status === "Renewed" && !program;
  const showNeedsNote = (status === "Did Not Renew - Call Done" || status === "MIA") && !notes.trim();

  const cardBorder = dirty
    ? "1px solid rgba(200,169,110,0.45)"
    : flagged
      ? "1px solid rgba(224,85,85,0.30)"
      : "1px solid var(--steel-a-15)";

  return (
    <div className="card" style={{ padding: 0, overflow: "hidden", border: cardBorder }}>
      <div style={{ position: "relative" }}>
        {flagged && (
          <div
            style={{
              position: "absolute",
              left: 0,
              top: "50%",
              transform: "translateY(-50%)",
              width: 3,
              height: 34,
              borderRadius: 2,
              background: "var(--warning)",
            }}
          />
        )}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            padding: "11px 18px",
            paddingLeft: flagged ? 24 : 18,
          }}
        >
          <button
            onClick={() => setOpen((o) => !o)}
            aria-label={open ? "Hide program & notes" : "Show program & notes"}
            style={{
              flexShrink: 0,
              width: 26,
              height: 26,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "none",
              border: "1px solid rgba(34,120,172,0.25)",
              borderRadius: 7,
              color: "var(--fg-3)",
              cursor: "pointer",
            }}
          >
            <ChevronIcon open={open} />
          </button>

          <div style={{ flexGrow: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ fontSize: 15, fontWeight: 500, color: "var(--fg-1)", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{client.clientName}</span>
              <StateBadge state={state} />
              {flagged && <NeedsActionBadge />}
              {contractBadge && contractBadge.total > 1 && (
                <ContractCountBadge number={contractBadge.number} total={contractBadge.total} />
              )}
              {showCoach && <span className="label" style={{ color: "var(--steel-400)" }}>{client.coachName.toUpperCase()}</span>}
            </div>
            <div style={{ fontSize: 12, color: "var(--fg-3)", display: "flex", alignItems: "center", gap: 6, overflow: "hidden" }}>
              <span style={{ whiteSpace: "nowrap" }}>{programLabel(client.retentionProgram) === "—" ? client.product : programLabel(client.retentionProgram)}</span>
              {notePreview && (
                <>
                  <span>·</span>
                  <NoteIcon />
                  <span style={{ color: "#A8B6C7", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {notePreview}{client.retentionNotes.length > 60 ? "…" : ""}
                  </span>
                </>
              )}
            </div>
          </div>

          <div style={{ flexShrink: 0, width: 250, display: "flex", flexDirection: "column", gap: 3, alignItems: "flex-end", textAlign: "right" }}>
            <div style={{ fontSize: 13, color: "var(--fg-2)", whiteSpace: "nowrap" }}>
              {fmtDate(client.contractStart)} – {fmtDate(client.contractEnd)}
            </div>
            <div style={{ fontSize: 12, color: end.color, whiteSpace: "nowrap" }}>{end.text}</div>
          </div>

          <div style={{ flexShrink: 0, width: 230 }}>
            {locked ? (
              <div
                style={{
                  padding: "9px 12px",
                  fontSize: 13,
                  borderRadius: 9,
                  background: "#0B1220",
                  border: "1px dashed rgba(138,155,176,0.25)",
                  color: "var(--fg-4)",
                }}
              >
                <div>Locked</div>
                <div style={{ fontSize: 11, marginTop: 2 }}>Opens when the contract starts</div>
              </div>
            ) : (
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as RetentionStatus)}
                style={{
                  width: "100%",
                  padding: "9px 12px",
                  fontSize: 13,
                  borderRadius: 9,
                  background: "var(--navy-700)",
                  border: `1px solid ${outcomeStyle.border}`,
                  color: outcomeStyle.color,
                }}
              >
                <option value="">— Not set —</option>
                {RETENTION_STATUSES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            )}
          </div>
        </div>
      </div>

      {open && (
        <div style={{ padding: "4px 18px 16px 60px", display: "flex", gap: 20, alignItems: "flex-start", flexWrap: "wrap" }}>
          <div style={{ width: 250, flexShrink: 0 }}>
            <div className="label" style={{ color: "var(--fg-4)", marginBottom: 6 }}>CONTINUING WITH</div>
            <select
              value={program}
              onChange={(e) => setProgram(e.target.value)}
              disabled={locked}
              className="field"
              style={{
                padding: "9px 12px",
                fontSize: 13,
                border: showRenewedNeedsProgram ? "1px solid rgba(200,169,110,0.55)" : undefined,
              }}
            >
              {PROGRAM_OPTIONS.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
            {showRenewedNeedsProgram && (
              <div style={{ fontSize: 11, color: "var(--gold)", marginTop: 6 }}>
                Renewed clients need a program selected
              </div>
            )}
          </div>

          <div style={{ flexGrow: 1, minWidth: 220 }}>
            <div className="label" style={{ color: "var(--fg-4)", marginBottom: 6 }}>NOTES</div>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={locked}
              rows={3}
              className="field"
              style={{ width: "100%", padding: "10px 12px", fontSize: 13, resize: "vertical" }}
            />
            {showNeedsNote && (
              <div style={{ fontSize: 12, color: "var(--gold)", marginTop: 6 }}>
                Add a short note on why they did not renew — it feeds the retention review
              </div>
            )}
          </div>

          <div style={{ width: 150, flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "flex-start", justifyContent: "flex-end", minHeight: 64, gap: 6 }}>
            <button
              onClick={save}
              disabled={saving || locked}
              style={{
                padding: "11px 16px",
                fontSize: 13,
                borderRadius: 9999,
                background: "var(--steel-600)",
                color: "#fff",
                border: "none",
                cursor: saving || locked ? "default" : "pointer",
                opacity: locked ? 0.5 : 1,
                whiteSpace: "nowrap",
              }}
            >
              {saving ? "Saving…" : "Save changes"}
            </button>
            {dirty && !saving && <div style={{ fontSize: 11, color: "var(--gold)" }}>Unsaved</div>}
            {justSaved && !dirty && <div style={{ fontSize: 11, color: "var(--success)" }}>Saved</div>}
            {error && <div style={{ fontSize: 11, color: "var(--warning)" }}>{error}</div>}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- screen ----------

type ChipKey = "active" | "needsAction" | "closed" | "future" | "all";
type SortKey = "ending-soonest" | "name-az" | "most-recent-start";

const CHIPS: { key: ChipKey; label: string }[] = [
  { key: "active", label: "Active" },
  { key: "needsAction", label: "Needs action" },
  { key: "closed", label: "Closed" },
  { key: "future", label: "Future" },
  { key: "all", label: "All" },
];

// The sort control only ever offers these 3 options. Each chip's default
// picks whichever one matches its natural order (Active/Needs action/All
// want end-ascending; Closed wants most-recently-started as a close stand-in
// for "most recent first" — the two correlate closely for finished
// contracts). Future is the one chip where "ending soonest" and "starting
// soonest" genuinely diverge (contract lengths vary), so its comparator
// below is defined per-chip rather than as one fixed function.
const CHIP_DEFAULT_SORT: Record<ChipKey, SortKey> = {
  active: "ending-soonest",
  needsAction: "ending-soonest",
  closed: "most-recent-start",
  future: "ending-soonest",
  all: "ending-soonest",
};

function sortersFor(chip: ChipKey): Record<SortKey, (a: RetentionClient, b: RetentionClient) => number> {
  return {
    // For the Future chip there's no "end" event pending yet — the relevant
    // "soonest" date is the start date — so this compares by start there,
    // and by end everywhere else.
    "ending-soonest": chip === "future"
      ? (a, b) => (a.contractStart < b.contractStart ? -1 : a.contractStart > b.contractStart ? 1 : 0)
      : (a, b) => (a.contractEnd < b.contractEnd ? -1 : a.contractEnd > b.contractEnd ? 1 : 0),
    "name-az": (a, b) => a.clientName.localeCompare(b.clientName),
    "most-recent-start": (a, b) => (a.contractStart < b.contractStart ? 1 : a.contractStart > b.contractStart ? -1 : 0),
  };
}

const COLUMN_WIDTHS = { disclosure: 26, contract: 250, outcome: 230, gap: 16 };

export function RetentionScreen() {
  const [clients, setClients] = useState<RetentionClient[] | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [coachNames, setCoachNames] = useState<string[]>([]);
  const [viewAs, setViewAs] = useState(ALL_COACHES);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [activeChip, setActiveChip] = useState<ChipKey>("active");
  const [sortBy, setSortBy] = useState<SortKey>("ending-soonest");
  const [dirtyKeys, setDirtyKeys] = useState<Set<string>>(new Set());
  const [resetNonce, setResetNonce] = useState(0);

  const today = useMemo(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), n.getDate());
  }, []);

  useEffect(() => {
    setClients(null);
    setError(null);
    setDirtyKeys(new Set());
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

  const handleDirtyChange = useCallback((key: string, dirty: boolean) => {
    setDirtyKeys((prev) => {
      if (dirty === prev.has(key)) return prev;
      const next = new Set(prev);
      if (dirty) next.add(key); else next.delete(key);
      return next;
    });
  }, []);

  // Keeps chip counts/filters/badges in sync with a just-saved row without
  // waiting for a full refetch — otherwise a resolved row would linger in
  // "Needs action" until the next page load.
  const handleSaved = useCallback((key: string, next: { status: RetentionStatus; program: string; notes: string }) => {
    setClients((prev) => {
      if (!prev) return prev;
      return prev.map((c) => {
        const k = `${c.email.trim().toLowerCase()}|${c.contractStart}`;
        if (k !== key) return c;
        return { ...c, retentionStatus: next.status, retentionProgram: next.program, retentionNotes: next.notes };
      });
    });
  }, []);

  const confirmDiscardIfDirty = useCallback(() => {
    if (dirtyKeys.size === 0) return true;
    const ok = window.confirm("You have unsaved changes on one or more rows. Leave without saving?");
    if (ok) {
      setDirtyKeys(new Set());
      setResetNonce((n) => n + 1);
    }
    return ok;
  }, [dirtyKeys]);

  useEffect(() => {
    setLeaveGuard(() => {
      if (dirtyKeys.size === 0) return true;
      return window.confirm("You have unsaved changes on one or more rows. Leave without saving?");
    });
    return () => setLeaveGuard(null);
  }, [dirtyKeys]);

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirtyKeys.size > 0) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirtyKeys]);

  // Grouped once per full dataset so "Contract N of M" stays correct
  // regardless of which chip/search/sort is currently applied.
  const contractInfoByKey = useMemo(() => {
    const map = new Map<string, { number: number; total: number }>();
    if (!clients) return map;
    const byEmail = new Map<string, RetentionClient[]>();
    for (const c of clients) {
      const key = c.email.trim().toLowerCase();
      const list = byEmail.get(key);
      if (list) list.push(c); else byEmail.set(key, [c]);
    }
    for (const list of byEmail.values()) {
      const sorted = [...list].sort((a, b) => (a.contractStart < b.contractStart ? -1 : a.contractStart > b.contractStart ? 1 : 0));
      sorted.forEach((c, idx) => {
        map.set(`${c.email.trim().toLowerCase()}|${c.contractStart}`, { number: idx + 1, total: sorted.length });
      });
    }
    return map;
  }, [clients]);

  const chipCounts = useMemo(() => {
    const counts: Record<ChipKey, number> = { active: 0, needsAction: 0, closed: 0, future: 0, all: 0 };
    if (!clients) return counts;
    for (const c of clients) {
      const state = contractState(c.contractStart, c.contractEnd, today);
      counts.all++;
      if (state === "ACTIVE") counts.active++;
      else if (state === "FUTURE") counts.future++;
      else if (state === "CLOSED") {
        counts.closed++;
        if (isUnresolved(c.retentionStatus)) counts.needsAction++;
      }
    }
    return counts;
  }, [clients, today]);

  const visible = useMemo(() => {
    if (!clients) return [];
    const q = query.trim().toLowerCase();
    const filtered = clients.filter((c) => {
      const state = contractState(c.contractStart, c.contractEnd, today);
      const matchesChip =
        activeChip === "all" ? true :
        activeChip === "active" ? state === "ACTIVE" :
        activeChip === "closed" ? state === "CLOSED" :
        activeChip === "future" ? state === "FUTURE" :
        state === "CLOSED" && isUnresolved(c.retentionStatus);
      if (!matchesChip) return false;
      if (!q) return true;
      return c.clientName.toLowerCase().includes(q) || c.email.toLowerCase().includes(q);
    });
    return [...filtered].sort(sortersFor(activeChip)[sortBy]);
  }, [clients, query, activeChip, sortBy, today]);

  if (error) return <p style={{ color: "var(--warning)" }}>{error}</p>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {isAdmin && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div className="label" style={{ color: "var(--fg-4)" }}>VIEWING AS</div>
          <select
            className="field"
            value={viewAs}
            onChange={(e) => {
              if (!confirmDiscardIfDirty()) return;
              setViewAs(e.target.value);
            }}
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
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
            <input
              className="field"
              placeholder="Search by name or email…"
              value={query}
              onChange={(e) => {
                if (query.length === 0 && !confirmDiscardIfDirty()) return;
                setQuery(e.target.value);
              }}
              style={{ maxWidth: 340, padding: "11px 16px" }}
            />
            <select
              className="field"
              value={sortBy}
              onChange={(e) => {
                if (!confirmDiscardIfDirty()) return;
                setSortBy(e.target.value as SortKey);
              }}
              style={{ maxWidth: 220, padding: "11px 14px" }}
            >
              <option value="ending-soonest">Ending soonest</option>
              <option value="name-az">Name A–Z</option>
              <option value="most-recent-start">Most recently started</option>
            </select>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {CHIPS.map((chip) => {
              const selected = activeChip === chip.key;
              const isNeedsAction = chip.key === "needsAction";
              const style: React.CSSProperties = {
                borderRadius: 9999,
                padding: "8px 16px",
                fontSize: 13,
                border: "1px solid",
                cursor: "pointer",
                background: selected
                  ? (isNeedsAction ? "rgba(224,85,85,0.22)" : "var(--steel-600)")
                  : (isNeedsAction ? "rgba(224,85,85,0.10)" : "transparent"),
                borderColor: selected
                  ? (isNeedsAction ? "rgba(224,85,85,0.55)" : "var(--steel-600)")
                  : (isNeedsAction ? "rgba(224,85,85,0.35)" : "rgba(34,120,172,0.25)"),
                color: selected ? "#fff" : (isNeedsAction ? "#F08A8A" : "var(--fg-3)"),
              };
              return (
                <button
                  key={chip.key}
                  style={style}
                  onClick={() => {
                    if (!confirmDiscardIfDirty()) return;
                    setActiveChip(chip.key);
                    setSortBy(CHIP_DEFAULT_SORT[chip.key]);
                  }}
                >
                  {chip.label} ({chipCounts[chip.key]})
                </button>
              );
            })}
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: COLUMN_WIDTHS.gap,
              padding: "0 18px",
            }}
          >
            <div style={{ width: COLUMN_WIDTHS.disclosure, flexShrink: 0 }} />
            <div style={{ flexGrow: 1, fontSize: 10, fontWeight: 700, letterSpacing: "0.16em", color: "var(--fg-4)" }}>CLIENT</div>
            <div style={{ width: COLUMN_WIDTHS.contract, flexShrink: 0, fontSize: 10, fontWeight: 700, letterSpacing: "0.16em", color: "var(--fg-4)", textAlign: "right" }}>CONTRACT</div>
            <div style={{ width: COLUMN_WIDTHS.outcome, flexShrink: 0, fontSize: 10, fontWeight: 700, letterSpacing: "0.16em", color: "var(--fg-4)" }}>RETENTION OUTCOME</div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {visible.length === 0 ? (
              <p style={{ color: "var(--fg-4)" }}>No clients match.</p>
            ) : (
              visible.map((c, i) => (
                <RetentionRow
                  key={`${c.email}-${c.contractStart}-${i}-${resetNonce}`}
                  client={c}
                  showCoach={isAdmin && viewAs === ALL_COACHES}
                  today={today}
                  contractBadge={contractInfoByKey.get(`${c.email.trim().toLowerCase()}|${c.contractStart}`) ?? null}
                  onDirtyChange={handleDirtyChange}
                  onSaved={handleSaved}
                />
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
