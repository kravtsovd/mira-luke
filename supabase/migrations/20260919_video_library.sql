-- Run once before enabling library writes. Existing rows remain valid.
alter table public.videos
  add column if not exists source_url text,
  add column if not exists thumbnail_url text,
  add column if not exists duration_seconds integer check (duration_seconds >= 0),
  add column if not exists published_at timestamptz,
  add column if not exists tags text[] not null default '{}',
  add column if not exists category_source text check (category_source in ('llm', 'manual')),
  add column if not exists category_model text;

-- youtube_id is already the primary key: concurrent imports cannot duplicate it.
-- Keep anonymous writes closed; only the server's service role can insert.
grant select, insert on public.videos to service_role;
notify pgrst, 'reload schema';
