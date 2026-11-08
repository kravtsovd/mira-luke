
begin;

create table if not exists public.families (
  id text primary key check (id ~ '^[a-z][a-z0-9-]{1,31}$'),
  name text not null check (char_length(btrim(name)) between 1 and 60),
  created_at timestamptz not null default now()
);

create table if not exists public.family_members (
  email text primary key check (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(email) <= 254),
  family_id text not null references public.families(id) on delete cascade,
  role text not null default 'parent' check (role in ('parent')),
  added_by text,
  created_at timestamptz not null default now()
);
create index if not exists family_members_family_idx on public.family_members (family_id);

insert into public.families (id, name) values ('demo', 'Демо-семья') on conflict (id) do nothing;
-- Add parents through your own deployment after Google sign-in.

alter table public.profile_settings add column if not exists family_id text;
update public.profile_settings set family_id = 'demo' where family_id is null;
alter table public.profile_settings alter column family_id set not null;
alter table public.profile_settings alter column family_id set default 'demo';
alter table public.profile_settings drop constraint if exists profile_settings_family_fk;
alter table public.profile_settings add constraint profile_settings_family_fk
  foreign key (family_id) references public.families(id) on delete restrict;
-- Mira's and Luke's own games only make sense in their own family.
alter table public.profile_settings drop constraint if exists profile_settings_builtin_family_check;
alter table public.profile_settings add constraint profile_settings_builtin_family_check
  check (profile not in ('mira', 'luke') or family_id = 'demo');
create index if not exists profile_settings_family_idx on public.profile_settings (family_id, sort_order);

alter table public.families enable row level security;
alter table public.family_members enable row level security;
revoke all on public.families, public.family_members from public, anon, authenticated;
grant select, insert, update, delete on public.families, public.family_members to service_role;

notify pgrst, 'reload schema';
commit;
