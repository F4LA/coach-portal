alter table public.coach
  add column if not exists base_salary_cents integer not null default 0;
