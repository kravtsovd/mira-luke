
begin;

alter table public.profile_settings
  add column if not exists name text,
  add column if not exists avatar text,
  add column if not exists kind text,
  add column if not exists sort_order integer,
  add column if not exists created_at timestamptz not null default now();

update public.profile_settings set name = 'Mira', avatar = '🌸', kind = 'mira', sort_order = 0
  where profile = 'mira' and kind is null;
update public.profile_settings set name = 'Luke', avatar = '🚙', kind = 'luke', sort_order = 1
  where profile = 'luke' and kind is null;

alter table public.profile_settings
  alter column name set not null,
  alter column avatar set not null,
  alter column kind set not null,
  alter column sort_order set not null;

alter table public.profile_settings drop constraint if exists profile_settings_profile_check;
alter table public.profile_settings add constraint profile_settings_profile_check
  check (profile ~ '^[a-z][a-z0-9-]{1,31}$');
alter table public.profile_settings drop constraint if exists profile_settings_name_check;
alter table public.profile_settings add constraint profile_settings_name_check
  check (char_length(btrim(name)) between 1 and 24);
alter table public.profile_settings drop constraint if exists profile_settings_avatar_check;
alter table public.profile_settings add constraint profile_settings_avatar_check
  check (char_length(avatar) between 1 and 16);
-- Mira's and Luke's personal games are built around them; a new child gets one of the two shared game sets.
alter table public.profile_settings drop constraint if exists profile_settings_kind_check;
alter table public.profile_settings add constraint profile_settings_kind_check
  check (case when profile in ('mira', 'luke') then kind = profile else kind in ('toddler', 'preschool') end);

grant select, insert, update, delete on public.profile_settings to service_role;

-- Memberships now name any child id; existence is checked by the write paths below.
alter table public.videos drop constraint if exists videos_profiles_check;
alter table public.videos add constraint videos_profiles_check
  check (array_position(profiles, null) is null
    and array_to_string(profiles, ',') ~ '^([a-z][a-z0-9-]{1,31}(,[a-z][a-z0-9-]{1,31})*)?$');

create or replace function public.add_video_to_profile(video_id text, child_profile text)
returns setof public.videos
language plpgsql security definer set search_path = public
as $$
begin
  if child_profile is null or not exists (select 1 from public.profile_settings where profile = child_profile) then
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

-- One transaction removes the child and every trace of them. A video only this child owned is deleted:
-- removing the last id would leave an empty list, and an empty list means "shared with every child".
create or replace function public.delete_child_profile(child_profile text)
returns setof public.profile_settings
language plpgsql security definer set search_path = public
as $$
begin
  if child_profile is null or child_profile in ('mira', 'luke') then
    raise exception 'Protected child profile' using errcode = '22023';
  end if;
  perform 1 from public.profile_settings where profile = child_profile for update;
  delete from public.videos where profiles = array[child_profile];
  update public.videos set profiles = array_remove(profiles, child_profile) where child_profile = any(profiles);
  return query delete from public.profile_settings where profile = child_profile returning *;
end;
$$;
revoke all on function public.delete_child_profile(text) from public, anon, authenticated;
grant execute on function public.delete_child_profile(text) to service_role;

notify pgrst, 'reload schema';
commit;
