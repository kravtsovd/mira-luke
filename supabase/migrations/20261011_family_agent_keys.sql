
begin;

create table if not exists public.family_agent_keys (
  id uuid primary key default gen_random_uuid(),
  family_id text not null references public.families(id) on delete cascade,
  label text not null check (char_length(btrim(label)) between 1 and 60),
  key_hash text not null unique check (key_hash ~ '^[0-9a-f]{64}$'),
  key_prefix text not null check (char_length(key_prefix) between 4 and 16),
  created_by text not null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
create index if not exists family_agent_keys_family_idx on public.family_agent_keys (family_id) where revoked_at is null;
alter table public.family_agent_keys enable row level security;
revoke all on public.family_agent_keys from public, anon, authenticated;
grant select, insert, update on public.family_agent_keys to service_role;

-- Removes one child from a video in one locked step. A video only that child had is deleted, because an empty
-- list would make it shared with every child; a shared video (empty list) is never touched.
create or replace function public.remove_video_from_profile(video_id text, child_profile text)
returns text
language plpgsql security definer set search_path = public
as $$
declare current_profiles text[];
begin
  select profiles into current_profiles from public.videos where youtube_id = video_id for update;
  if not found then return 'missing'; end if;
  if cardinality(current_profiles) = 0 then return 'shared'; end if;
  if not (child_profile = any(current_profiles)) then return 'not_member'; end if;
  if current_profiles = array[child_profile] then
    delete from public.videos where youtube_id = video_id;
    return 'deleted';
  end if;
  update public.videos set profiles = array_remove(profiles, child_profile) where youtube_id = video_id;
  return 'removed';
end;
$$;
revoke all on function public.remove_video_from_profile(text, text) from public, anon, authenticated;
grant execute on function public.remove_video_from_profile(text, text) to service_role;

notify pgrst, 'reload schema';
commit;
