begin;
create table public.ai_credentials (
 provider text primary key check(provider in ('openai','openrouter')),
 ciphertext text not null,
 revision uuid not null default gen_random_uuid(),
 models jsonb not null default '[]',
 tested_model text,
 tested_at timestamptz,
 updated_at timestamptz not null default now()
);
alter table public.ai_credentials enable row level security;
revoke all on public.ai_credentials from public,anon,authenticated;
grant all on public.ai_credentials to service_role;
alter table public.platform_settings add column active_provider text, add column active_model text, add column active_revision uuid;
create table public.ai_call_usage (day date primary key, attempts integer not null default 0);
alter table public.ai_call_usage enable row level security;
revoke all on public.ai_call_usage from public,anon,authenticated;
grant all on public.ai_call_usage to service_role;
create function public.reserve_ai_call(p_limit integer) returns boolean language plpgsql security invoker set search_path='' as $$
declare n integer; d date=(now() at time zone 'UTC')::date;
begin
 if p_limit<1 or p_limit>100000 then return false; end if;
 insert into public.ai_call_usage(day) values(d) on conflict do nothing;
 update public.ai_call_usage set attempts=attempts+1 where day=d and attempts<p_limit returning attempts into n;
 return n is not null;
end $$;
create function public.admin_ai_change(p_actor uuid,p_action text,p_provider text,p_revision uuid,p_payload jsonb,p_reason text) returns void language plpgsql security invoker set search_path='' as $$
declare c public.ai_credentials;
begin
 if length(trim(p_reason))<8 then raise exception 'REASON_REQUIRED';end if;
 -- Consistent settings -> credential lock order prevents rotation/activation races.
 perform 1 from public.platform_settings where id for update;
 if p_action='save' then
  insert into public.ai_credentials(provider,ciphertext,revision,models) values(p_provider,p_payload->>'ciphertext',p_revision,p_payload->'models')
  on conflict(provider) do update set ciphertext=excluded.ciphertext,revision=excluded.revision,models=excluded.models,tested_model=null,tested_at=null,updated_at=now();
  if exists(select 1 from public.platform_settings where active_provider=p_provider) then
   update public.platform_settings set generation_paused=true,active_revision=null where id;
  end if;
 elsif p_action='test' then
  update public.ai_credentials set tested_model=p_payload->>'model',tested_at=now() where provider=p_provider and revision=p_revision;
  if not found then raise exception 'CREDENTIAL_CHANGED';end if;
 elsif p_action='activate' then
  select * into c from public.ai_credentials where provider=p_provider for update;
  if c.revision is distinct from p_revision or c.tested_model is distinct from p_payload->>'model' or c.tested_at is null or c.tested_at<now()-interval '1 hour' then raise exception 'TEST_REQUIRED';end if;
  update public.platform_settings set active_provider=p_provider,active_model=c.tested_model,active_revision=c.revision where id;
 else raise exception 'INVALID_ACTION';end if;
 insert into public.audit_events(actor_id,action,resource_id,details) values(p_actor,'platform.ai.'||p_action,p_provider,jsonb_build_object('reason',p_reason,'model',p_payload->>'model','revision',p_revision));
end $$;
revoke all on function public.reserve_ai_call(integer),public.admin_ai_change(uuid,text,text,uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.reserve_ai_call(integer),public.admin_ai_change(uuid,text,text,uuid,jsonb,text) to service_role;
commit;
