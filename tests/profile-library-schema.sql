begin;
insert into public.videos (youtube_id, title, channel, topic_id, profiles)
values ('profile0001', 'Profile membership test', 'Test', 'vehicles', array['luke']);
set local role service_role;
select * from public.add_video_to_profile('profile0001', 'mira');
select * from public.add_video_to_profile('profile0001', 'mira');
reset role;
do $$
begin
  if (select profiles from public.videos where youtube_id = 'profile0001') <> array['luke', 'mira'] then
    raise exception 'Membership was lost or duplicated';
  end if;
  if (select topic_id from public.videos where youtube_id = 'profile0001') <> 'vehicles' then
    raise exception 'Metadata changed';
  end if;
  if has_function_privilege('anon', 'public.add_video_to_profile(text,text)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.add_video_to_profile(text,text)', 'EXECUTE') then
    raise exception 'Public membership writes allowed';
  end if;
  begin
    perform public.add_video_to_profile('profile0001', 'unknown');
    raise exception 'Invalid profile allowed';
  exception when invalid_parameter_value then null;
  end;
  begin
    update public.videos set profiles = array['unknown'] where youtube_id = 'profile0001';
    raise exception 'Unknown membership allowed';
  exception when check_violation then null;
  end;
end;
$$;
rollback;
