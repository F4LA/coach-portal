-- Weekly Form Tracker: closed weeks are frozen and stored here so history
-- (and consecutive-miss detection) doesn't depend on recomputing from the
-- live Roster/Form Responses sheets every time — those sheets can change
-- after the fact, but a closed week's result should not.
-- Read/written only by the server via the service-role client — no RLS
-- policies needed since browsers never talk to this table directly.

create table if not exists public.form_tracker_week (
  week_key text primary key, -- ISO date of that week's Thursday start, e.g. '2026-09-11'
  computed_at timestamptz not null default now(),
  payload jsonb not null
);

-- No policies on purpose: the server only ever accesses this table with the
-- service_role key, which bypasses RLS anyway. Enabling RLS with zero
-- policies fully blocks anon/authenticated access (e.g. someone hitting the
-- REST API directly with the public anon key) without touching server code.
alter table public.form_tracker_week enable row level security;
