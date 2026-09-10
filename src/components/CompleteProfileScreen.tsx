"use client";

import { useEffect, useState } from "react";

export function CompleteProfileScreen({ onDone }: { onDone: () => void }) {
  const [names, setNames] = useState<string[] | null>(null);
  const [name, setName] = useState("");
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
    const res = await fetch("/api/complete-profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const body = await res.json();
    setPending(false);
    if (!res.ok) {
      setError(body.error || "Couldn't finish setting up your account.");
      return;
    }
    onDone();
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
        <h2 style={{ fontSize: 32, textAlign: "center" }}>One more thing</h2>
        <p style={{ color: "var(--fg-3)", marginTop: 10, textAlign: "center" }}>
          Which coach are you? Must match the Client Mastersheet exactly.
        </p>

        {error && (
          <div style={{ marginTop: 20, padding: "12px 16px", borderRadius: "var(--radius-input)", background: "rgba(224,85,85,0.1)", border: "1px solid rgba(224,85,85,0.35)", color: "var(--warning)", fontSize: 13 }}>
            {error}
          </div>
        )}

        <form style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 24 }} onSubmit={handleSubmit}>
          <div>
            <div className="label" style={{ color: "var(--fg-3)", marginBottom: 8 }}>YOUR NAME</div>
            <select className="field" value={name} onChange={(e) => setName(e.target.value)} required disabled={names === null}>
              <option value="" disabled>{names === null ? "Loading…" : "Select your name"}</option>
              {(names ?? []).map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
          <button type="submit" disabled={pending} className="btn btn-primary" style={{ width: "100%", marginTop: 8, opacity: pending ? 0.7 : 1 }}>
            {pending ? "Saving…" : "Continue"}
          </button>
        </form>
      </div>
    </div>
  );
}
