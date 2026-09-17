"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LoginScreen } from "./LoginScreen";
import { NoAccessScreen } from "./NoAccessScreen";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { RosterScreen } from "./screens/RosterScreen";
import { PayoutsScreen } from "./screens/PayoutsScreen";
import { RetentionScreen } from "./screens/RetentionScreen";
import { FormTrackerScreen } from "./screens/FormTrackerScreen";
import { SettingsScreen } from "./screens/SettingsScreen";
import { createClient } from "@/lib/supabase/client";
import { canLeaveCurrentScreen } from "@/lib/navGuard";
import type { Coach } from "@/lib/coach";

export type Screen = "roster" | "payouts" | "retention" | "form-tracker" | "settings";

export function CoachPortal() {
  const [checkingSession, setCheckingSession] = useState(true);
  const [authed, setAuthed] = useState(false);
  const [coach, setCoach] = useState<Coach | null>(null);
  const [profileChecked, setProfileChecked] = useState(false);
  const [authedEmail, setAuthedEmail] = useState("");
  const [screen, setScreen] = useState<Screen>("roster");
  const supabase = useRef(createClient()).current;

  const loadCoach = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setCoach(null);
      setProfileChecked(true);
      return;
    }
    const { data } = await supabase.from("coach").select("name, is_admin").eq("id", user.id).maybeSingle();
    if (data) {
      setCoach({ id: user.id, name: data.name, email: user.email ?? "", isAdmin: data.is_admin });
    } else {
      setAuthedEmail(user.email ?? "");
    }
    setProfileChecked(true);
  }, [supabase]);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setAuthed(!!session);
      if (session) await loadCoach();
      setCheckingSession(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setAuthed(!!session);
      if (session) {
        await loadCoach();
      } else {
        setCoach(null);
        setProfileChecked(false);
      }
    });

    return () => listener.subscription.unsubscribe();
  }, [supabase, loadCoach]);

  const handleSignIn = async (email: string, password: string): Promise<string | null> => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return "Email or password is incorrect.";
    return null;
  };

  const handleForgotPassword = async (email: string): Promise<string | null> => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) return "Something went wrong. Try again in a moment.";
    return null;
  };

  const handleGoogleSignIn = async () => {
    await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: window.location.origin } });
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  if (checkingSession) {
    return <div style={{ minHeight: "100vh", background: "var(--navy-900)" }} />;
  }

  if (!authed) {
    return <LoginScreen onSignIn={handleSignIn} onGoogleSignIn={handleGoogleSignIn} onForgotPassword={handleForgotPassword} />;
  }

  if (!profileChecked) {
    return <div style={{ minHeight: "100vh", background: "var(--navy-900)" }} />;
  }

  if (!coach) {
    return <NoAccessScreen email={authedEmail} onSignOut={handleSignOut} />;
  }

  return (
    <div
      className="ap-shell"
      style={{
        minHeight: "100vh",
        display: "grid",
        gridTemplateColumns: "248px 1fr",
        background: "var(--navy-900)",
        color: "var(--fg-2)",
        fontFamily: "var(--font-sans)",
      }}
    >
      <Sidebar
        coach={coach}
        active={screen}
        onNavigate={(next) => {
          if (!canLeaveCurrentScreen()) return;
          setScreen(next);
        }}
        onSignOut={handleSignOut}
      />

      <main style={{ minWidth: 0, padding: "0 0 80px" }}>
        <Header screen={screen} />
        <div style={{ padding: "clamp(28px, 3.5vw, 44px) clamp(24px, 4vw, 48px) 0" }}>
          {screen === "roster" && <RosterScreen />}
          {screen === "payouts" && <PayoutsScreen />}
          {screen === "retention" && <RetentionScreen />}
          {screen === "form-tracker" && <FormTrackerScreen />}
          {screen === "settings" && <SettingsScreen coach={coach} />}
        </div>
      </main>
    </div>
  );
}
