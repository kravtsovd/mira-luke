-- Disposable test database only. Apply schema.sql and the library migration first.
begin;
insert into public.videos (youtube_id, title, channel, language, topic_id, source_url,
  thumbnail_url, duration_seconds, published_at, tags, category_source)
values ('testvideo01', 'Test trains', 'Test channel', 'en', 'vehicles',
  'https://www.youtube.com/watch?v=testvideo01',
  'https://i.ytimg.com/vi/testvideo01/hqdefault.jpg', 150,
  '2026-09-01T10:00:00Z', array['train'], 'manual');

do $$
begin
  begin
    insert into public.videos (youtube_id, title, channel, topic_id)
      values ('testvideo01', 'Duplicate', 'Channel', 'songs');
    raise exception 'Duplicate unexpectedly accepted';
  exception when unique_violation then null;
  end;
  begin
    update public.videos set topic_id = 'invalid' where youtube_id = 'testvideo01';
    raise exception 'Invalid category unexpectedly accepted';
  exception when check_violation then null;
  end;
  begin
    update public.videos set duration_seconds = -1 where youtube_id = 'testvideo01';
    raise exception 'Negative duration unexpectedly accepted';
  exception when check_violation then null;
  end;
  if (select count(*) from public.videos where youtube_id = 'testvideo01' and topic_id = 'vehicles' and tags = array['train']) <> 1 then
    raise exception 'Stored metadata changed';
  end if;
  if has_table_privilege('anon', 'public.videos', 'INSERT') or has_table_privilege('authenticated', 'public.videos', 'INSERT') then
    raise exception 'Public writes unexpectedly allowed';
  end if;
  if not has_table_privilege('service_role', 'public.videos', 'INSERT') then
    raise exception 'Server writes unavailable';
  end if;
end;
$$;
rollback;
