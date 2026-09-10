"use client";

export function Toast({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        bottom: 28,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 40,
        display: "flex",
        alignItems: "center",
        gap: 12,
        background: "var(--navy-700)",
        border: "1px solid var(--steel-a-35)",
        borderRadius: "var(--radius-pill)",
        padding: "13px 24px",
        boxShadow: "var(--glow-steel)",
        fontSize: 13,
        color: "var(--fg-1)",
        animation: "toastIn 180ms ease-out",
      }}
    >
      <span style={{ color: "var(--success)" }}>✓</span>
      {message}
    </div>
  );
}
