
begin;
create table if not exists public.family_reports (
  family_id text not null references public.families(id) on delete cascade,
  name text not null check (name in ('viewer.html', 'skill-tree.html')),
  html text not null check (char_length(html) between 1 and 5000000),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  updated_at timestamptz not null default now(),
  primary key (family_id, name)
);
alter table public.family_reports enable row level security;
revoke all on public.family_reports from public, anon, authenticated;
grant select, insert, update on public.family_reports to service_role;
notify pgrst, 'reload schema';
commit;
