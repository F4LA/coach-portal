"use client";

import { useState } from "react";
import type { Screen } from "./CoachPortal";
import type { Coach } from "@/lib/coach";

function RosterIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 6h16M4 12h16M4 18h10" strokeLinecap="round" />
    </svg>
  );
}
function PayoutsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function RetentionIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function SettingsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.14.6.6 1.06 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

const NAV_ITEMS: { id: Screen; label: string; icon: React.ReactNode }[] = [
  { id: "roster", label: "Client Roster", icon: <RosterIcon /> },
  { id: "payouts", label: "Payouts", icon: <PayoutsIcon /> },
  { id: "retention", label: "Retention", icon: <RetentionIcon /> },
];
const SETTINGS_ITEM = { id: "settings" as const, label: "Settings", icon: <SettingsIcon /> };

function initialsFor(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("");
}

export function Sidebar({
  coach,
  active,
  onNavigate,
  onSignOut,
}: {
  coach: Coach;
  active: Screen;
  onNavigate: (screen: Screen) => void;
  onSignOut: () => void;
}) {
  const [open, setOpen] = useState(false);

  const handleNavigate = (screen: Screen) => {
    onNavigate(screen);
    setOpen(false);
  };

  return (
    <aside
      className="ap-side"
      style={{
        position: "sticky",
        top: 0,
        height: "100vh",
        background: "var(--navy-800)",
        borderRight: "1px solid var(--steel-a-15)",
        display: "flex",
        flexDirection: "column",
        padding: "28px 0",
      }}
    >
      <div className="ap-side-top" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 24px 26px" }}>
        <div style={{ fontFamily: "var(--font-display)", fontSize: 19, letterSpacing: "0.06em", color: "var(--fg-1)", whiteSpace: "nowrap" }}>
          STRONG<span style={{ color: "var(--steel-400)" }}>STANDARD</span>
        </div>
        <button
          className="ap-menu-btn"
          onClick={() => setOpen((o) => !o)}
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          style={{ display: "none", background: "none", border: "1px solid var(--steel-a-30)", borderRadius: 10, width: 38, height: 38, alignItems: "center", justifyContent: "center", color: "var(--fg-1)", fontSize: 16, cursor: "pointer" }}
        >
          {open ? "✕" : "☰"}
        </button>
      </div>

      <div className={`ap-mobile-panel${open ? " open" : ""}`} style={{ display: "flex", flexDirection: "column", flex: 1 }}>
        <nav className="ap-sidenav" style={{ display: "flex", flexDirection: "column", gap: 2, padding: "0 12px" }}>
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              className={`nav-item${active === item.id ? " active" : ""}`}
              onClick={() => handleNavigate(item.id)}
              aria-current={active === item.id ? "page" : undefined}
            >
              <span style={{ width: 18, display: "inline-flex", justifyContent: "center" }}>{item.icon}</span>
              {item.label}
            </button>
          ))}
          <button
            className={`nav-item${active === SETTINGS_ITEM.id ? " active" : ""}`}
            onClick={() => handleNavigate(SETTINGS_ITEM.id)}
            aria-current={active === SETTINGS_ITEM.id ? "page" : undefined}
          >
            <span style={{ width: 18, display: "inline-flex", justifyContent: "center" }}>{SETTINGS_ITEM.icon}</span>
            {SETTINGS_ITEM.label}
          </button>
        </nav>

        <div className="ap-side-foot" style={{ marginTop: "auto", padding: "20px 24px 0", borderTop: "1px solid var(--steel-a-15)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
            <div style={{ width: 34, height: 34, borderRadius: "var(--radius-pill)", background: "var(--navy-600)", border: "1px solid var(--steel-a-30)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-display)", fontSize: 15, color: "var(--steel-400)" }}>
              {initialsFor(coach.name)}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, color: "var(--fg-1)", whiteSpace: "nowrap" }}>{coach.name}</div>
            </div>
          </div>
          <button onClick={onSignOut} style={{ marginTop: 16, background: "none", border: "none", padding: 0, color: "var(--fg-4)", fontSize: 12, cursor: "pointer" }}>
            Sign out
          </button>
        </div>
      </div>
    </aside>
  );
}
