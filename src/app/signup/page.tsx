"use client";

import { useRouter } from "next/navigation";
import { SignupScreen } from "@/components/SignupScreen";

export default function SignupPage() {
  const router = useRouter();
  return <SignupScreen onDone={() => router.push("/")} />;
}
