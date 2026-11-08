begin;
alter table public.mira_learning_progress drop constraint if exists mira_learning_progress_skill_check;
alter table public.mira_learning_progress add constraint mira_learning_progress_skill_check check(skill in ('addition','addition-quantity-v1','name-letters'));
create or replace function public.record_mira_learning(fam text, attempt uuid, skill_id text, expected_level integer, is_correct boolean)
returns setof public.mira_learning_progress language plpgsql security definer set search_path=public as $$
declare r public.mira_learning_progress; lim integer;
begin
 if fam <> 'demo' or skill_id not in ('addition','addition-quantity-v1','name-letters') then raise exception 'invalid scope'; end if;
 insert into mira_learning_progress(family_id,profile,skill) values(fam,'mira',skill_id) on conflict do nothing;
 select * into r from mira_learning_progress where family_id=fam and profile='mira' and skill=skill_id for update;
 if exists(select 1 from mira_learning_attempts where id=attempt) then return next r;return;end if;
 if r.level <> expected_level then raise exception 'stale level'; end if;
 lim := case when skill_id in ('addition','addition-quantity-v1') then 3 else 1 end;
 insert into mira_learning_attempts(id,family_id,profile,skill,correct,level) values(attempt,fam,'mira',skill_id,is_correct,r.level);
 r.attempts:=r.attempts+1;r.correct:=r.correct+is_correct::integer;
 r.streak:=case when is_correct then r.streak+1 else 0 end;
 if r.streak>=3 then r.completed:=greatest(r.completed,r.level);r.level:=least(lim,r.level+1);r.streak:=0;end if;
 update mira_learning_progress set level=r.level,streak=r.streak,attempts=r.attempts,correct=r.correct,completed=r.completed,updated_at=now()
 where family_id=fam and profile='mira' and skill=skill_id returning * into r;
 return next r;
end $$;
revoke all on function public.record_mira_learning(text,uuid,text,integer,boolean) from public,anon,authenticated;
grant execute on function public.record_mira_learning(text,uuid,text,integer,boolean) to service_role;
commit;
