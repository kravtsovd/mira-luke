-- Existing videos remain shared. New app saves explicitly supply one child.
begin;
alter table public.videos
  add column if not exists profiles text[] not null default '{}';
alter table public.videos drop constraint if exists videos_profiles_check;
alter table public.videos add constraint videos_profiles_check
  check (profiles <@ array['mira', 'luke']::text[] and array_position(profiles, null) is null);

-- Retire the unused pre-release column only if it contains no individual picks.
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public'
    and table_name = 'videos' and column_name = 'library_profiles') then
    if exists (select 1 from public.videos where not library_profiles @> array['mira', 'luke']) then
      raise exception 'Preserve individual library_profiles memberships before migration';
    end if;
    alter table public.videos drop column library_profiles;
  end if;
end;
$$;

-- One locked update merges membership without changing the video's metadata.
create or replace function public.add_video_to_profile(video_id text, child_profile text)
returns setof public.videos
language plpgsql security definer set search_path = public
as $$
begin
  if child_profile is null or child_profile not in ('mira', 'luke') then
    raise exception 'Invalid child profile' using errcode = '22023';
  end if;
  return query
    update public.videos
    set profiles = case
      when cardinality(profiles) = 0 or child_profile = any(profiles) then profiles
      else array_append(profiles, child_profile)
    end
    where youtube_id = video_id and enabled = true
    returning *;
end;
$$;
revoke all on function public.add_video_to_profile(text, text) from public, anon, authenticated;
grant execute on function public.add_video_to_profile(text, text) to service_role;
notify pgrst, 'reload schema';
commit;
