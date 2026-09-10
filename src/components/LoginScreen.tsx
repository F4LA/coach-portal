"use client";

import { useState } from "react";

export function LoginScreen({
  onSignIn,
  onGoogleSignIn,
  onForgotPassword,
}: {
  onSignIn: (email: string, password: string) => Promise<string | null>;
  onGoogleSignIn: () => void;
  onForgotPassword: (email: string) => Promise<string | null>;
}) {
  const [mode, setMode] = useState<"signin" | "forgot" | "sent">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setPending(true);
    const message = await onSignIn(email, password);
    setPending(false);
    if (message) setError(message);
  };

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setPending(true);
    const message = await onForgotPassword(email);
    setPending(false);
    if (message) {
      setError(message);
    } else {
      setMode("sent");
    }
  };

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
      <div style={{ width: "100%", maxWidth: 400 }}>
        <div
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 22,
            letterSpacing: "0.06em",
            color: "var(--fg-1)",
            marginBottom: 40,
            textAlign: "center",
          }}
        >
          STRONG<span style={{ color: "var(--steel-400)" }}>STANDARD</span>
        </div>

        {mode === "sent" ? (
          <>
            <h2 style={{ fontSize: 36 }}>Check your email</h2>
            <p style={{ color: "var(--fg-3)", marginTop: 10 }}>
              If an account exists for <span style={{ color: "var(--fg-1)" }}>{email}</span>, a
              reset link is on its way.
            </p>
            <button onClick={() => setMode("signin")} className="btn btn-outline" style={{ width: "100%", marginTop: 24 }}>
              Back to sign in
            </button>
          </>
        ) : mode === "forgot" ? (
          <>
            <h2 style={{ fontSize: 36 }}>Reset password</h2>
            <p style={{ color: "var(--fg-3)", marginTop: 10 }}>
              Enter your email and we&apos;ll send you a link to set a new password.
            </p>
            {error && (
              <div style={{ marginTop: 20, padding: "12px 16px", borderRadius: "var(--radius-input)", background: "rgba(224,85,85,0.1)", border: "1px solid rgba(224,85,85,0.35)", color: "var(--warning)", fontSize: 13 }}>
                {error}
              </div>
            )}
            <form style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 24 }} onSubmit={handleForgotSubmit}>
              <div>
                <div className="label" style={{ color: "var(--fg-3)", marginBottom: 8 }}>EMAIL</div>
                <input className="field" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <button type="submit" disabled={pending} className="btn btn-primary" style={{ width: "100%", marginTop: 8, opacity: pending ? 0.7 : 1 }}>
                {pending ? "Sending…" : "Send reset link"}
              </button>
              <button
                type="button"
                onClick={() => { setMode("signin"); setError(null); }}
                style={{ background: "none", border: "none", color: "var(--fg-3)", fontSize: 13, cursor: "pointer", padding: 0 }}
              >
                ← Back to sign in
              </button>
            </form>
          </>
        ) : (
          <>
            <h2 style={{ fontSize: 36, textAlign: "center" }}>Coach login</h2>
            <p style={{ color: "var(--fg-3)", marginTop: 10, textAlign: "center" }}>
              Enter your email and password to see your client roster.
            </p>

            {error && (
              <div style={{ marginTop: 20, padding: "12px 16px", borderRadius: "var(--radius-input)", background: "rgba(224,85,85,0.1)", border: "1px solid rgba(224,85,85,0.35)", color: "var(--warning)", fontSize: 13 }}>
                {error}
              </div>
            )}

            <form style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 24 }} onSubmit={handleSubmit}>
              <div>
                <div className="label" style={{ color: "var(--fg-3)", marginBottom: 8 }}>EMAIL</div>
                <input className="field" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <div>
                <div className="label" style={{ color: "var(--fg-3)", marginBottom: 8 }}>PASSWORD</div>
                <input className="field" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", fontSize: 13 }}>
                <button type="button" onClick={() => { setMode("forgot"); setError(null); }} style={{ background: "none", border: "none", color: "var(--steel-400)", fontSize: 13, cursor: "pointer", padding: 0 }}>
                  Reset password
                </button>
              </div>
              <button type="submit" disabled={pending} className="btn btn-primary" style={{ width: "100%", marginTop: 4, opacity: pending ? 0.7 : 1, cursor: pending ? "default" : "pointer" }}>
                {pending ? "Signing in…" : (<>Sign in <span style={{ fontSize: 16 }}>→</span></>)}
              </button>
            </form>

            <div style={{ display: "flex", alignItems: "center", gap: 14, margin: "26px 0" }}>
              <div style={{ flex: 1, height: 1, background: "linear-gradient(90deg, transparent, var(--steel-a-30), transparent)" }} />
              <div className="label" style={{ color: "var(--fg-4)" }}>OR</div>
              <div style={{ flex: 1, height: 1, background: "linear-gradient(90deg, transparent, var(--steel-a-30), transparent)" }} />
            </div>

            <button onClick={onGoogleSignIn} className="btn btn-outline" style={{ width: "100%" }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M21.35 11.1h-9.17v2.96h5.32c-.23 1.4-1.66 4.1-5.32 4.1-3.2 0-5.82-2.65-5.82-5.92S9 6.32 12.18 6.32c1.83 0 3.05.78 3.75 1.45l2.55-2.46C16.84 3.77 14.72 2.9 12.18 2.9 7.13 2.9 3.05 6.98 3.05 12.03s4.08 9.14 9.13 9.14c5.27 0 8.75-3.7 8.75-8.92 0-.6-.07-1.05-.16-1.5z" />
              </svg>
              Continue with Google
            </button>

            <p style={{ marginTop: 32, color: "var(--fg-4)", fontSize: 12, lineHeight: 1.6, textAlign: "center" }}>
              Not set up yet? <a href="/signup">Create your coach account</a>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
