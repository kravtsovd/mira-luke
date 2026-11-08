-- Give each video an optional owner so Mira and Luke can have separate shelves.
-- Existing rows keep an empty list, which means both children keep seeing them.
alter table public.videos
  add column if not exists profiles text[] not null default '{}';

alter table public.videos
  drop constraint if exists videos_profiles_check;

alter table public.videos
  add constraint videos_profiles_check
  check (profiles <@ array['mira', 'luke']::text[]);
