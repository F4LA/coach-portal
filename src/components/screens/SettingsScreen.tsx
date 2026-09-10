"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Coach } from "@/lib/coach";

export function SettingsScreen({ coach }: { coach: Coach }) {
  const [email, setEmail] = useState(coach.email);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null);

  const emailChanged = email.trim() !== coach.email;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailChanged) return;
    setPending(true);
    setMessage(null);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ email: email.trim() });
    setPending(false);
    if (error) {
      setMessage({ text: "Couldn't update your email. Try again in a moment.", isError: true });
      return;
    }
    setMessage({ text: "Check both your old and new email inboxes to confirm the change.", isError: false });
  };

  return (
    <div style={{ maxWidth: 480 }}>
      <form onSubmit={handleSave} className="card" style={{ padding: 28 }}>
        <h3>Profile</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 20 }}>
          <div>
            <div className="label" style={{ color: "var(--fg-3)", marginBottom: 8 }}>NAME</div>
            <input className="field" value={coach.name} disabled style={{ padding: "12px 15px", color: "var(--fg-3)", cursor: "not-allowed" }} />
            <div style={{ fontSize: 12, color: "var(--fg-4)", marginTop: 8 }}>
              Must match your name in the Client Mastersheet — contact an admin to change it.
            </div>
          </div>
          <div>
            <div className="label" style={{ color: "var(--fg-3)", marginBottom: 8 }}>EMAIL</div>
            <input className="field" type="email" value={email} onChange={(e) => setEmail(e.target.value)} style={{ padding: "12px 15px" }} />
          </div>
          {message && (
            <div style={{ fontSize: 13, color: message.isError ? "var(--warning)" : "var(--success)" }}>{message.text}</div>
          )}
          <button
            type="submit"
            disabled={!emailChanged || pending}
            className="btn btn-primary"
            style={{ alignSelf: "flex-start", padding: "12px 24px", opacity: !emailChanged || pending ? 0.5 : 1, cursor: !emailChanged || pending ? "default" : "pointer" }}
          >
            {pending ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>
    </div>
  );
}
