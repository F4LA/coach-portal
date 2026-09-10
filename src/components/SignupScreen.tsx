"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function SignupScreen({ onDone }: { onDone: () => void }) {
  const [names, setNames] = useState<string[] | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    fetch("/api/coach-names")
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data) => setNames(data.names))
      .catch(() => setNames([]));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name) {
      setError("Choose your name from the list.");
      return;
    }
    setPending(true);
    try {
      const res = await fetch("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error || "Couldn't create the account.");
        setPending(false);
        return;
      }
      const supabase = createClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      setPending(false);
      if (signInError) {
        setError("Account created — sign in below.");
        return;
      }
      onDone();
    } catch {
      setError("Couldn't connect. Try again.");
      setPending(false);
    }
  };

  const handleGoogleSignIn = async () => {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: window.location.origin } });
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
      <div style={{ width: "100%", maxWidth: 420 }}>
        <div
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 22,
            letterSpacing: "0.06em",
            color: "var(--fg-1)",
            marginBottom: 32,
            textAlign: "center",
          }}
        >
          STRONG<span style={{ color: "var(--steel-400)" }}>STANDARD</span>
        </div>

        <h2 style={{ fontSize: 32, textAlign: "center" }}>Create your coach account</h2>
        <p style={{ color: "var(--fg-3)", marginTop: 10, textAlign: "center" }}>
          Your name must match how it appears in the Client Mastersheet.
        </p>

        {error && (
          <div style={{ marginTop: 20, padding: "12px 16px", borderRadius: "var(--radius-input)", background: "rgba(224,85,85,0.1)", border: "1px solid rgba(224,85,85,0.35)", color: "var(--warning)", fontSize: 13 }}>
            {error}
          </div>
        )}

        <form style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 24 }} onSubmit={handleSubmit}>
          <div>
            <div className="label" style={{ color: "var(--fg-3)", marginBottom: 8 }}>YOUR NAME</div>
            <select
              className="field"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              disabled={names === null}
            >
              <option value="" disabled>
                {names === null ? "Loading…" : "Select your name"}
              </option>
              {(names ?? []).map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
          <div>
            <div className="label" style={{ color: "var(--fg-3)", marginBottom: 8 }}>EMAIL</div>
            <input className="field" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div>
            <div className="label" style={{ color: "var(--fg-3)", marginBottom: 8 }}>PASSWORD</div>
            <input className="field" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
          </div>
          <button type="submit" disabled={pending} className="btn btn-primary" style={{ width: "100%", marginTop: 8, opacity: pending ? 0.7 : 1 }}>
            {pending ? "Creating account…" : "Create account"}
          </button>
        </form>

        <div style={{ display: "flex", alignItems: "center", gap: 14, margin: "26px 0" }}>
          <div style={{ flex: 1, height: 1, background: "linear-gradient(90deg, transparent, var(--steel-a-30), transparent)" }} />
          <div className="label" style={{ color: "var(--fg-4)" }}>OR</div>
          <div style={{ flex: 1, height: 1, background: "linear-gradient(90deg, transparent, var(--steel-a-30), transparent)" }} />
        </div>

        <button onClick={handleGoogleSignIn} className="btn btn-outline" style={{ width: "100%" }}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M21.35 11.1h-9.17v2.96h5.32c-.23 1.4-1.66 4.1-5.32 4.1-3.2 0-5.82-2.65-5.82-5.92S9 6.32 12.18 6.32c1.83 0 3.05.78 3.75 1.45l2.55-2.46C16.84 3.77 14.72 2.9 12.18 2.9 7.13 2.9 3.05 6.98 3.05 12.03s4.08 9.14 9.13 9.14c5.27 0 8.75-3.7 8.75-8.92 0-.6-.07-1.05-.16-1.5z" />
          </svg>
          Continue with Google
        </button>

        <p style={{ marginTop: 24, color: "var(--fg-4)", fontSize: 12, textAlign: "center" }}>
          Already have an account? <a href="/">Sign in</a>
        </p>
      </div>
    </div>
  );
}
