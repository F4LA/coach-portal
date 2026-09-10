"use client";

import type { Screen } from "./CoachPortal";

function metaFor(screen: Screen): { crumb: string; title: string } {
  switch (screen) {
    case "roster":
      return { crumb: "CLIENTS", title: "Your roster" };
    case "settings":
      return { crumb: "ACCOUNT", title: "Settings" };
  }
}

export function Header({ screen }: { screen: Screen }) {
  const meta = metaFor(screen);
  return (
    <header
      className="ap-header"
      style={{
        position: "sticky",
        top: 0,
        zIndex: 5,
        background: "rgba(8,13,26,0.78)",
        backdropFilter: "blur(14px)",
        borderBottom: "1px solid var(--steel-a-15)",
        padding: "20px clamp(24px, 4vw, 48px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 24,
        flexWrap: "wrap",
      }}
    >
      <div>
        <div className="eyebrow" style={{ marginBottom: 6 }}>{meta.crumb}</div>
        <div style={{ fontFamily: "var(--font-display)", fontSize: 30, lineHeight: 1, letterSpacing: "0.02em", color: "var(--fg-1)", textTransform: "uppercase" }}>
          {meta.title}
        </div>
      </div>
    </header>
  );
}
