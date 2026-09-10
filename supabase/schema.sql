-- Coach portal: one row per logged-in coach. Client/contract/payout data is
-- NOT stored here — it's read live from the Client Mastersheet Google Sheet
-- (see src/lib/mastersheet.ts) and matched to a coach by exact name.

create table public.coach (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  is_admin boolean not null default false,
  status text not null default 'active',
  created_at timestamptz not null default now()
);

alter table public.coach enable row level security;

create policy "Coaches can view their own row"
  on public.coach for select
  using (auth.uid() = id);

create policy "Coaches can insert their own row on signup"
  on public.coach for insert
  with check (auth.uid() = id);

create policy "Coaches can update their own row"
  on public.coach for update
  using (auth.uid() = id);
