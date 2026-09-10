"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    // Supabase reads the recovery token out of the URL and fires this once
    // the temporary recovery session is established.
    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setReady(true);
    });
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setReady(true);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setPending(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    setPending(false);
    if (error) {
      setError("Couldn't update your password. Try requesting a new link.");
      return;
    }
    setDone(true);
    setTimeout(() => router.push("/"), 1500);
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
      <div style={{ width: "100%", maxWidth: 380 }}>
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

        {done ? (
          <>
            <h2 style={{ fontSize: 36, textAlign: "center" }}>Password updated</h2>
            <p style={{ color: "var(--fg-3)", marginTop: 10, textAlign: "center" }}>Taking you to your dashboard…</p>
          </>
        ) : !ready ? (
          <>
            <h2 style={{ fontSize: 36, textAlign: "center" }}>Checking your link…</h2>
            <p style={{ color: "var(--fg-3)", marginTop: 10, textAlign: "center" }}>
              If this doesn't update in a few seconds, the link may have expired — request a new
              one from the sign-in page.
            </p>
          </>
        ) : (
          <>
            <h2 style={{ fontSize: 36, textAlign: "center" }}>Set a new password</h2>

            {error && (
              <div
                style={{
                  marginTop: 20,
                  padding: "12px 16px",
                  borderRadius: "var(--radius-input)",
                  background: "rgba(224,85,85,0.1)",
                  border: "1px solid rgba(224,85,85,0.35)",
                  color: "var(--warning)",
                  fontSize: 13,
                }}
              >
                {error}
              </div>
            )}

            <form style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 24 }} onSubmit={handleSubmit}>
              <div>
                <div className="label" style={{ color: "var(--fg-3)", marginBottom: 8 }}>NEW PASSWORD</div>
                <input
                  className="field"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={8}
                  required
                />
              </div>
              <button
                type="submit"
                disabled={pending}
                className="btn btn-primary"
                style={{ width: "100%", opacity: pending ? 0.7 : 1 }}
              >
                {pending ? "Saving…" : "Set password"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
