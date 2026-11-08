begin;
-- One family installation, the same scope as the existing shared video library.
create table if not exists public.profile_settings (
  profile text primary key check (profile in ('mira', 'luke')),
  settings jsonb not null check (jsonb_typeof(settings) = 'object'),
  revision bigint not null default 1 check (revision between 1 and 9007199254740991),
  updated_at timestamptz not null default now()
);
alter table public.profile_settings enable row level security;
revoke all on public.profile_settings from public, anon, authenticated;
grant select, update on public.profile_settings to service_role;

-- Existing cloud preferences always win over deployment defaults.
insert into public.profile_settings (profile, settings) values
('mira', '{"menuLayout":"feed","learningEnabled":true,"intervalMinutes":10,"soundEnabled":true,"enabledGames":["huntrix"]}'),
('luke', '{"menuLayout":"feed","learningEnabled":true,"intervalMinutes":5,"soundEnabled":true,"enabledGames":["cars"]}')
on conflict (profile) do nothing;
notify pgrst, 'reload schema';
commit;
