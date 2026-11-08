-- Public catalog: app reads anonymously; writes use the dashboard or the server's service role.
create table if not exists public.videos (
  youtube_id text primary key check (youtube_id ~ '^[A-Za-z0-9_-]{11}$'),
  playback_id text check (playback_id is null or playback_id ~ '^[A-Za-z0-9_-]{11}$'),
  title text not null check (char_length(title) between 1 and 300),
  channel text not null check (char_length(channel) between 1 and 200),
  language text not null default 'en' check (language in ('en', 'ru', 'unknown')),
  topic_id text not null check (topic_id in ('stories', 'learning', 'vehicles', 'songs', 'adventures')),
  duration_label text check (duration_label is null or char_length(duration_label) <= 20),
  search_terms text[] not null default '{}',
  -- Empty means every child sees the video; otherwise it stays on the listed children's shelves.
  profiles text[] not null default '{}' check (array_position(profiles, null) is null
    and array_to_string(profiles, ',') ~ '^([a-z][a-z0-9-]{1,31}(,[a-z][a-z0-9-]{1,31})*)?$'),
  sort_order integer not null default 0,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists videos_enabled_order_idx
  on public.videos (enabled, sort_order, created_at);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists videos_set_updated_at on public.videos;
create trigger videos_set_updated_at
before update on public.videos
for each row execute function public.set_updated_at();

alter table public.videos enable row level security;
drop policy if exists "Anyone can read enabled videos" on public.videos;
create policy "Anyone can read enabled videos"
  on public.videos for select
  to anon, authenticated
  using (enabled = true);

grant select on public.videos to anon, authenticated;
revoke insert, update, delete, truncate, references, trigger on public.videos from anon, authenticated;
