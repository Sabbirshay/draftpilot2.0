begin;
alter table public.teams add column billing_plan text not null default 'free' check(billing_plan in ('free','team')),
 add column billing_seats integer not null default 1 check(billing_seats between 1 and 100),
 add column billing_limit integer not null default 50 check(billing_limit between 0 and 1000000),
 add column manual_override jsonb;
update public.teams set billing_plan=plan,billing_seats=seat_limit,billing_limit=monthly_draft_limit;
alter table public.audit_events add column details jsonb not null default '{}';
alter table public.platform_settings add column generation_paused boolean not null default false,
 add column ai_config jsonb not null default '{}';
create table public.user_controls(user_id uuid primary key references auth.users(id) on delete cascade,
 email text not null default '',full_name text not null default '',
 suspended boolean not null default false,generation_blocked boolean not null default false,
 monthly_limit integer check(monthly_limit between 0 and 1000000),updated_at timestamptz not null default now());
create table public.user_usage(user_id uuid not null references auth.users(id) on delete cascade,
 month date not null,draft_count integer not null default 0 check(draft_count>=0),primary key(user_id,month));
insert into public.user_usage select user_id,date_trunc('month',created_at at time zone 'UTC')::date,count(*) from public.draft_history where user_id is not null and status<>'failed' group by 1,2;
alter table public.user_controls enable row level security;
alter table public.user_usage enable row level security;
revoke all on public.user_controls,public.user_usage from public,anon,authenticated;
grant all on public.user_controls,public.user_usage to service_role;
create function private.apply_entitlements() returns trigger language plpgsql set search_path='' as $$
begin
 if new.manual_override is not null then
  new.plan=new.manual_override->>'plan';new.seat_limit=(new.manual_override->>'seats')::integer;new.monthly_draft_limit=(new.manual_override->>'limit')::integer;
 else new.plan=new.billing_plan;new.seat_limit=new.billing_seats;new.monthly_draft_limit=new.billing_limit;end if;
 return new;
end $$;
create trigger team_entitlements before update of billing_plan,billing_seats,billing_limit,manual_override on public.teams for each row execute function private.apply_entitlements();
create or replace function private.current_team_id() returns uuid language sql stable security definer set search_path='' as $$
 select u.team_id from public.users u join public.teams t on t.id=u.team_id
 where u.id=auth.uid() and not t.frozen
 and not exists(select 1 from public.user_controls c where c.user_id=u.id and c.suspended)
 and not exists(select 1 from public.banned_emails b where lower(b.email)=lower(u.email))
 and (select count(*) from public.users seat where seat.team_id=u.team_id and
 (case when seat.role='owner' then 0 else 1 end,seat.created_at,seat.id) <=
 (case when u.role='owner' then 0 else 1 end,u.created_at,u.id)) <= t.seat_limit
$$;
create or replace function public.reserve_draft(p_team uuid,p_user uuid,p_request uuid,p_channel text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare lim integer;used integer;ctl public.user_controls;existing public.draft_history;created public.draft_history;m date=date_trunc('month',now() at time zone 'UTC')::date;
begin
 select monthly_draft_limit into lim from public.teams where id=p_team and not frozen for update;
 if not found then raise exception 'WORKSPACE_DISABLED';end if;
 if not exists(select 1 from public.users where id=p_user and team_id=p_team) then raise exception 'FORBIDDEN';end if;
 insert into public.user_controls(user_id,email,full_name) select id,email,full_name from public.users where id=p_user on conflict do nothing;
 select * into ctl from public.user_controls where user_id=p_user for update;
 if ctl.suspended or ctl.generation_blocked or exists(select 1 from public.users u join public.banned_emails b on lower(b.email)=lower(u.email) where u.id=p_user) then raise exception 'USER_RESTRICTED';end if;
 if (select generation_paused from public.platform_settings where id) then raise exception 'GENERATION_PAUSED';end if;
 if not public.has_workspace_seat(p_team,p_user) then raise exception 'FORBIDDEN';end if;
 select * into existing from public.draft_history where team_id=p_team and request_id=p_request;
 if found then
  if existing.user_id is distinct from p_user then raise exception 'FORBIDDEN';end if;
  return jsonb_build_object('existing',true,'record',to_jsonb(existing));
 end if;
 insert into public.usage(team_id,month) values(p_team,m) on conflict do nothing;
 select draft_count into used from public.usage where team_id=p_team and month=m for update;
 if used>=lim then raise exception 'QUOTA_EXCEEDED';end if;
 insert into public.user_usage(user_id,month) values(p_user,m) on conflict do nothing;
 select draft_count into used from public.user_usage where user_id=p_user and month=m for update;
 if ctl.monthly_limit is not null and used>=ctl.monthly_limit then raise exception 'USER_QUOTA_EXCEEDED';end if;
 update public.usage set draft_count=draft_count+1 where team_id=p_team and month=m;
 update public.user_usage set draft_count=draft_count+1 where user_id=p_user and month=m;
 insert into public.draft_history(team_id,user_id,request_id,channel) values(p_team,p_user,p_request,p_channel) returning * into created;
 return jsonb_build_object('existing',false,'record',to_jsonb(created));
end $$;
create or replace function public.fail_draft(p_team uuid,p_id uuid) returns void language plpgsql security invoker set search_path='' as $$
declare stamp timestamptz;uid uuid;
begin
 perform 1 from public.teams where id=p_team for update;
 update public.draft_history set status='failed',source='failed' where id=p_id and team_id=p_team and status='pending' returning created_at,user_id into stamp,uid;
 if stamp is not null then
 update public.usage set draft_count=greatest(0,draft_count-1) where team_id=p_team and month=date_trunc('month',stamp at time zone 'UTC')::date;
 update public.user_usage set draft_count=greatest(0,draft_count-1) where user_id=uid and month=date_trunc('month',stamp at time zone 'UTC')::date;
 end if;
end $$;
create or replace function public.apply_subscription(p_event text,p_created bigint,p_customer text,p_subscription text,p_active boolean,p_seats integer) returns boolean language plpgsql security invoker set search_path='' as $$
begin
 insert into public.webhook_events(id) values(p_event) on conflict do nothing;if not found then return false;end if;
 update public.teams set billing_seats=case when p_active then least(greatest(p_seats,1),100) else 1 end,
 billing_plan=case when p_active then 'team' else 'free' end,
 billing_limit=case when p_active then least(greatest(p_seats,1),100)*1000 else 50 end,
 stripe_subscription_id=case when p_active then p_subscription else null end,billing_event_at=p_created
 where stripe_customer_id=p_customer and billing_event_at<=p_created
 and (p_active or stripe_subscription_id is null or stripe_subscription_id=p_subscription);
 return true;
end $$;
-- API validates administrator identity + MFA; these mutation routines are service-role-only.
create function public.admin_change(p_actor uuid,p_kind text,p_target uuid,p_changes jsonb,p_reason text) returns void language plpgsql security invoker set search_path='' as $$
declare previous jsonb; result jsonb;tid uuid;
begin
 if length(trim(p_reason)) not between 8 and 300 then raise exception 'REASON_REQUIRED';end if;
 if p_kind='user' then
  if p_actor=p_target and (coalesce((p_changes->>'suspended')::boolean,false) or coalesce((p_changes->>'generation_blocked')::boolean,false)) then raise exception 'SELF_RESTRICTION';end if;
  select team_id into tid from public.users where id=p_target;
  if tid is null and not exists(select 1 from public.user_controls where user_id=p_target) then raise exception 'NOT_FOUND';end if;
  perform 1 from public.teams where id=tid for update;
  insert into public.user_controls(user_id) values(p_target) on conflict do nothing;
  update public.user_controls c set email=u.email,full_name=u.full_name from public.users u where c.user_id=p_target and u.id=p_target;
  select to_jsonb(c) into previous from public.user_controls c where user_id=p_target for update;
  update public.user_controls set suspended=case when p_changes?'suspended' then (p_changes->>'suspended')::boolean else suspended end,
   generation_blocked=case when p_changes?'generation_blocked' then (p_changes->>'generation_blocked')::boolean else generation_blocked end,
   monthly_limit=case when p_changes?'monthly_limit' then (p_changes->>'monthly_limit')::integer else monthly_limit end,updated_at=now()
   where user_id=p_target returning to_jsonb(user_controls) into result;
  if (result->>'suspended')::boolean then
   update public.extension_tokens set revoked_at=now() where user_id=p_target and revoked_at is null;
   delete from public.extension_codes where user_id=p_target;
  end if;
 elsif p_kind='workspace' then
  tid=p_target;select jsonb_build_object('frozen',frozen,'manual_override',manual_override) into previous from public.teams where id=p_target for update;
  if not found then raise exception 'NOT_FOUND';end if;
  update public.teams set frozen=case when p_changes?'frozen' then (p_changes->>'frozen')::boolean else frozen end,
   manual_override=case when p_changes?'manual_override' then nullif(p_changes->'manual_override','null'::jsonb) else manual_override end
  where id=p_target returning jsonb_build_object('frozen',frozen,'manual_override',manual_override) into result;
 elsif p_kind='pipeline' then
  select to_jsonb(s) into previous from public.platform_settings s where id for update;
  update public.platform_settings set generation_paused=(p_changes->>'generation_paused')::boolean,
   max_output_tokens=(p_changes->>'max_output_tokens')::integer,ai_config=p_changes->'ai_config' where id returning to_jsonb(platform_settings) into result;
 else raise exception 'INVALID_ACTION';end if;
 insert into public.audit_events(actor_id,team_id,action,resource_id,details) values(p_actor,tid,'platform.'||p_kind||'.update',p_target::text,jsonb_build_object('reason',p_reason,'before',previous,'after',result));
end $$;
revoke all on function public.admin_change(uuid,text,uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.admin_change(uuid,text,uuid,jsonb,text) to service_role;
revoke all on function private.apply_entitlements() from public,anon,authenticated;
create view public.admin_user_directory with (security_invoker=true) as
 select u.id,u.email,u.full_name,u.role,u.created_at,u.team_id,t.name workspace,t.plan,t.billing_plan,t.manual_override,t.monthly_draft_limit,t.seat_limit,t.frozen,
 (select count(*) from public.users member where member.team_id=t.id) member_count,
 coalesce(c.suspended,false) suspended,coalesce(c.generation_blocked,false) generation_blocked,c.monthly_limit,coalesce(usage.draft_count,0) used
 from public.users u join public.teams t on t.id=u.team_id left join public.user_controls c on c.user_id=u.id
 left join public.user_usage usage on usage.user_id=u.id and usage.month=date_trunc('month',now() at time zone 'UTC')::date
 union all
 select c.user_id,c.email,c.full_name,'former member',c.updated_at,null::uuid,'No active workspace','free','free',null::jsonb,0,0,false,0::bigint,c.suspended,c.generation_blocked,c.monthly_limit,coalesce(usage.draft_count,0)
 from public.user_controls c left join public.user_usage usage on usage.user_id=c.user_id and usage.month=date_trunc('month',now() at time zone 'UTC')::date
 where not exists(select 1 from public.users u where u.id=c.user_id);
revoke all on public.admin_user_directory from public,anon,authenticated;
grant select on public.admin_user_directory to service_role;
create function public.admin_overview(p_query text default '',p_offset integer default 0) returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object(
 'metrics',jsonb_build_object('users',(select count(*) from public.admin_user_directory),'workspaces',(select count(*) from public.teams),'suspended',(select count(*) from public.user_controls where suspended),'monthDrafts',(select coalesce(sum(draft_count),0) from public.usage where month=date_trunc('month',now() at time zone 'UTC')::date)),
 'totalUsers',(select count(*) from public.admin_user_directory where email ilike '%'||p_query||'%' or full_name ilike '%'||p_query||'%'),
 'users',coalesce((select jsonb_agg(row_to_json(r)) from (
 select * from public.admin_user_directory u where u.email ilike '%'||p_query||'%' or u.full_name ilike '%'||p_query||'%' order by u.created_at desc,u.id limit 50 offset greatest(p_offset,0)) r),'[]'::jsonb),
 'totalWorkspaces',(select count(*) from public.teams where name ilike '%'||p_query||'%'),
 'workspaces',coalesce((select jsonb_agg(row_to_json(r)) from (select t.id,t.name,t.plan,t.frozen,t.billing_plan,t.manual_override,t.seat_limit,t.monthly_draft_limit,t.stripe_subscription_id,t.billing_event_at,coalesce(u.draft_count,0) used,
 (select count(*) from public.users member where member.team_id=t.id) member_count
 from public.teams t left join public.usage u on u.team_id=t.id and u.month=date_trunc('month',now() at time zone 'UTC')::date where t.name ilike '%'||p_query||'%' order by t.created_at desc,t.id limit 50 offset greatest(p_offset,0)) r),'[]'::jsonb),
 'audit',coalesce((select jsonb_agg(row_to_json(r)) from (select id,actor_id,action,resource_id,details,created_at from public.audit_events where action like 'platform.%' order by id desc limit 50) r),'[]'::jsonb)
 )
$$;
revoke all on function public.admin_overview(text,integer) from public,anon,authenticated;
grant execute on function public.admin_overview(text,integer) to service_role;
commit;
