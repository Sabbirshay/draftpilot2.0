-- Only the server's MFA-protected administrator API can manage global lessons.
create table public.training_lessons (
 id uuid primary key default gen_random_uuid(),
 title text not null check(length(title) between 3 and 100),
 mistake text not null check(length(mistake) between 8 and 2000),
 correction text not null check(length(correction) between 8 and 2000),
 lesson text not null check(length(lesson) between 8 and 400),
 status text not null default 'draft' check(status in ('draft','active','paused')),
 revision integer not null default 1,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.training_lessons enable row level security;
revoke all on public.training_lessons from public, anon, authenticated;
grant select, insert, update on public.training_lessons to service_role;

create function public.save_training_lesson(p_actor uuid,p_id uuid,p_revision integer,p_content jsonb,p_status text,p_reason text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare previous jsonb; result jsonb;
begin
 -- Serialize publication and enforce a bounded global prompt budget.
 perform 1 from public.platform_settings where id for update;
 if p_status not in ('draft','active','paused') or length(trim(p_reason)) not between 8 and 300 then raise exception 'INVALID_TRAINING_INPUT'; end if;
 if p_id is not null then
  select to_jsonb(t) into previous from public.training_lessons t where id=p_id for update;
  if previous is null then raise exception 'TRAINING_NOT_FOUND'; end if;
  if (previous->>'revision')::integer<>p_revision then raise exception 'TRAINING_CONFLICT'; end if;
 elsif (select count(*) from public.training_lessons)>=200 then raise exception 'TRAINING_CAPACITY';
 end if;
 if p_status='active' and (select count(*) from public.training_lessons where status='active' and (p_id is null or id<>p_id))>=20 then raise exception 'TRAINING_ACTIVE_LIMIT'; end if;
 if p_id is null then
  insert into public.training_lessons(title,mistake,correction,lesson,status)
  values(p_content->>'title',p_content->>'mistake',p_content->>'correction',p_content->>'lesson',p_status) returning to_jsonb(training_lessons) into result;
 else
  update public.training_lessons set title=p_content->>'title',mistake=p_content->>'mistake',correction=p_content->>'correction',lesson=p_content->>'lesson',status=p_status,revision=revision+1,updated_at=now()
  where id=p_id returning to_jsonb(training_lessons) into result;
 end if;
 insert into public.audit_events(actor_id,action,resource_id,details) values(p_actor,'platform.training.'||p_status,result->>'id',jsonb_build_object('reason',p_reason,'before',previous,'after',result));
 return result;
end $$;
revoke all on function public.save_training_lesson(uuid,uuid,integer,jsonb,text,text) from public,anon,authenticated;
grant execute on function public.save_training_lesson(uuid,uuid,integer,jsonb,text,text) to service_role;
