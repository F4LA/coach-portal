import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Uses the service_role key — bypasses Row Level Security. Server-only:
// never import this file from a Client Component.
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}
