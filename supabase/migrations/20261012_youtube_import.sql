
begin;
create table if not exists public.youtube_import_candidates (
  family_id text not null references public.families(id) on delete cascade,
  video_id text not null check (video_id ~ '^[A-Za-z0-9_-]{11}$'),
  title text not null check (char_length(title) between 1 and 300),
  channel text not null check (char_length(channel) between 1 and 200),
  source text not null check (source in ('liked', 'playlist', 'subscription')),
  created_at timestamptz not null default now(),
  primary key (family_id, video_id)
);
alter table public.youtube_import_candidates enable row level security;
revoke all on public.youtube_import_candidates from public, anon, authenticated;
grant select, insert, delete on public.youtube_import_candidates to service_role;
notify pgrst, 'reload schema';
commit;
