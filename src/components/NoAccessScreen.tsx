"use client";

export function NoAccessScreen({ email, onSignOut }: { email: string; onSignOut: () => void }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--navy-900)",
        color: "var(--fg-2)",
        fontFamily: "var(--font-sans)",
        padding: 32,
      }}
    >
      <div style={{ width: "100%", maxWidth: 420, textAlign: "center" }}>
        <div
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 22,
            letterSpacing: "0.06em",
            color: "var(--fg-1)",
            marginBottom: 32,
          }}
        >
          STRONG<span style={{ color: "var(--steel-400)" }}>STANDARD</span>
        </div>
        <h2 style={{ fontSize: 30 }}>No coach account yet</h2>
        <p style={{ color: "var(--fg-3)", marginTop: 14, lineHeight: 1.6 }}>
          <span style={{ color: "var(--fg-1)" }}>{email}</span> isn&apos;t set up as a coach yet.
          Ask an admin to create your account, then sign in again.
        </p>
        <button onClick={onSignOut} className="btn btn-outline" style={{ marginTop: 28, padding: "12px 28px" }}>
          Sign out
        </button>
      </div>
    </div>
  );
}
