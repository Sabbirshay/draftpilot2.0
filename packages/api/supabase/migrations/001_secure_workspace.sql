begin;
create extension if not exists vector with schema public;
create schema if not exists private;
grant usage on schema private to authenticated,service_role;
create table public.teams (
 id uuid primary key default gen_random_uuid(), name text not null check(char_length(name) between 1 and 80),
 plan text not null default 'free' check(plan in ('free','team')),monthly_draft_limit integer not null default 50 check(monthly_draft_limit between 0 and 1000000),
 tone text not null default 'friendly' check(tone in ('friendly','professional','empathetic','concise')),
 seat_limit integer not null default 1 check(seat_limit between 1 and 100),
 retention_days integer not null default 30 check(retention_days in (7,30,90)),frozen boolean not null default false,
 stripe_customer_id text unique,stripe_subscription_id text unique,billing_event_at bigint not null default 0,
 created_at timestamptz not null default now()
);
create table public.users(id uuid primary key references auth.users(id) on delete cascade,team_id uuid not null references public.teams(id) on delete cascade,email text not null,full_name text not null default '',role text not null default 'member' check(role in ('owner','admin','member')),unique(id,team_id),created_at timestamptz not null default now());
create index users_team_idx on public.users(team_id);
create table public.team_members(id uuid primary key default gen_random_uuid(),team_id uuid not null references public.teams(id) on delete cascade,user_id uuid not null,role text not null check(role in ('owner','admin','member')),unique(team_id,user_id),foreign key(user_id,team_id) references public.users(id,team_id) on delete cascade);
create table public.onboarding_state(team_id uuid primary key references public.teams(id) on delete cascade,viewed_demo boolean not null default false,extension_installed boolean not null default false,created_at timestamptz not null default now());
create table public.macros(id uuid primary key default gen_random_uuid(),team_id uuid not null references public.teams(id) on delete cascade,name text not null check(char_length(name)<=100),category text not null default 'General',content text not null check(char_length(content)<=8000),tags text[] not null default '{}',usage_count integer not null default 0,created_at timestamptz not null default now(),unique(id,team_id));
create table public.knowledge_documents(id uuid primary key default gen_random_uuid(),team_id uuid not null references public.teams(id) on delete cascade,name text not null,status text not null default 'ready' check(status in ('processing','ready','error')),file_type text not null default 'text',chunks_count integer not null default 0,created_at timestamptz not null default now(),unique(id,team_id));
create table public.document_chunks(id uuid primary key default gen_random_uuid(),team_id uuid not null references public.teams(id) on delete cascade,document_id uuid not null,chunk_index integer not null,chunk_text text not null check(char_length(chunk_text)<=2000),embedding vector(1536),foreign key(document_id,team_id) references public.knowledge_documents(id,team_id) on delete cascade,unique(document_id,chunk_index));
create table public.usage(team_id uuid not null references public.teams(id) on delete cascade,month date not null,draft_count integer not null default 0 check(draft_count>=0),primary key(team_id,month));
create table public.draft_history(id uuid primary key default gen_random_uuid(),team_id uuid not null references public.teams(id) on delete cascade,user_id uuid,request_id uuid not null,generated_draft text not null default '' check(char_length(generated_draft)<=12000),source text not null default 'pending',channel text not null default 'other',status text not null default 'pending' check(status in ('pending','draft','reviewed','failed')),sources jsonb not null default '[]',created_at timestamptz not null default now(),foreign key(user_id,team_id) references public.users(id,team_id) on delete set null (user_id),unique(team_id,request_id));
create index drafts_team_created_idx on public.draft_history(team_id,created_at desc);
create table public.platform_settings(id boolean primary key default true check(id),max_output_tokens integer not null default 600 check(max_output_tokens between 100 and 1200),feature_flags jsonb not null default '{}');
insert into public.platform_settings(id) values(true);
create table public.banned_emails(email text primary key,reason text not null default '',created_at timestamptz not null default now());
create unique index banned_normalized on public.banned_emails(lower(email));
create table public.audit_events(id bigint generated always as identity primary key,team_id uuid references public.teams(id) on delete cascade,actor_id uuid,action text not null,resource_id text,created_at timestamptz not null default now());
create table public.team_invites(id uuid primary key default gen_random_uuid(),team_id uuid not null references public.teams(id) on delete cascade,email text not null,role text not null check(role in ('admin','member')),token_hash text not null unique,expires_at timestamptz not null,accepted_at timestamptz,created_at timestamptz not null default now());
create table public.extension_tokens(id uuid primary key default gen_random_uuid(),team_id uuid not null references public.teams(id) on delete cascade,user_id uuid not null,token_hash text not null unique,name text not null default 'Gmail extension',expires_at timestamptz not null,revoked_at timestamptz,foreign key(user_id,team_id) references public.users(id,team_id) on delete cascade,created_at timestamptz not null default now());
create table public.extension_codes(code_hash text primary key,team_id uuid not null references public.teams(id) on delete cascade,user_id uuid not null references public.users(id) on delete cascade,expires_at timestamptz not null);
create table public.webhook_events(id text primary key,created_at timestamptz not null default now());
create table public.rate_limits(key text primary key,window_start timestamptz not null,count integer not null default 1);
-- No table grants permit browser mutation. The authenticated API is the sole writer.
create or replace function private.current_team_id() returns uuid language sql stable security definer set search_path='' as $$
 select u.team_id from public.users u join public.teams t on t.id=u.team_id
 where u.id=auth.uid() and not t.frozen
 and not exists(select 1 from public.banned_emails b where lower(b.email)=lower(u.email))
 and (select count(*) from public.users seat where seat.team_id=u.team_id and
 (case when seat.role='owner' then 0 else 1 end,seat.created_at,seat.id) <=
 (case when u.role='owner' then 0 else 1 end,u.created_at,u.id)) <= t.seat_limit
$$;
revoke all on function private.current_team_id() from public;
grant execute on function private.current_team_id() to authenticated;
do $$ declare t text;begin
 foreach t in array array['teams','users','team_members','onboarding_state','macros','knowledge_documents','document_chunks','usage','draft_history','platform_settings','banned_emails','audit_events','team_invites','extension_tokens','extension_codes','webhook_events','rate_limits'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon, authenticated',t);
 execute format('grant all on public.%I to service_role',t);
 end loop;
 foreach t in array array['users','team_members','onboarding_state','macros','knowledge_documents','document_chunks','usage','draft_history'] loop
 execute format('grant select on public.%I to authenticated',t);
 execute format('create policy tenant_read on public.%I for select to authenticated using (team_id = (select private.current_team_id()))',t);
 execute format('create index if not exists %I on public.%I(team_id)',t||'_team_idx',t);
 end loop;
end $$;
grant select on public.teams to authenticated;
create policy tenant_read on public.teams for select to authenticated using(id=(select private.current_team_id()));
grant usage,select on sequence public.audit_events_id_seq to service_role;
-- These service-only routines make quota, provisioning, and redemption atomic.
create function public.provision_workspace(p_user uuid,p_email text,p_name text) returns uuid language plpgsql security invoker set search_path='' as $$
declare tid uuid;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 select team_id into tid from public.users where id=p_user;if tid is not null then return tid;end if;
 insert into public.teams(name) values(p_name) returning id into tid;
 insert into public.users(id,team_id,email,role) values(p_user,tid,lower(p_email),'owner');
 insert into public.team_members(team_id,user_id,role) values(tid,p_user,'owner');
 insert into public.onboarding_state(team_id) values(tid);return tid;
end $$;
create function public.reserve_draft(p_team uuid,p_user uuid,p_request uuid,p_channel text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare lim integer;used integer;existing public.draft_history;created public.draft_history;m date=date_trunc('month',now() at time zone 'UTC')::date;
begin
 select monthly_draft_limit into lim from public.teams where id=p_team and not frozen for update;
 if not found then raise exception 'WORKSPACE_DISABLED';end if;
 if not exists(select 1 from public.users where id=p_user and team_id=p_team) then raise exception 'FORBIDDEN';end if;
 select * into existing from public.draft_history where team_id=p_team and request_id=p_request;
 if found then return jsonb_build_object('existing',true,'record',to_jsonb(existing));end if;
 insert into public.usage(team_id,month) values(p_team,m) on conflict do nothing;
 select draft_count into used from public.usage where team_id=p_team and month=m for update;
 if used>=lim then raise exception 'QUOTA_EXCEEDED';end if;
 update public.usage set draft_count=draft_count+1 where team_id=p_team and month=m;
 insert into public.draft_history(team_id,user_id,request_id,channel) values(p_team,p_user,p_request,p_channel) returning * into created;
 return jsonb_build_object('existing',false,'record',to_jsonb(created));
end $$;
create function public.fail_draft(p_team uuid,p_id uuid) returns void language plpgsql security invoker set search_path='' as $$
declare stamp timestamptz;
begin
 update public.draft_history set status='failed',source='failed' where id=p_id and team_id=p_team and status='pending' returning created_at into stamp;
 if stamp is not null then update public.usage set draft_count=greatest(0,draft_count-1) where team_id=p_team and month=date_trunc('month',stamp at time zone 'UTC')::date;end if;
end $$;
create function public.consume_rate_limit(p_key text,p_limit integer,p_seconds integer) returns boolean language plpgsql security invoker set search_path='' as $$
declare used integer;
begin
 insert into public.rate_limits(key,window_start,count) values(p_key,now(),1) on conflict(key) do update set count=case when rate_limits.window_start<now()-make_interval(secs=>p_seconds) then 1 else rate_limits.count+1 end,window_start=case when rate_limits.window_start<now()-make_interval(secs=>p_seconds) then now() else rate_limits.window_start end returning count into used;
 return used<=p_limit;
end $$;
create function public.add_knowledge(p_team uuid,p_name text,p_chunks jsonb) returns uuid language plpgsql security invoker set search_path='' as $$
declare doc uuid;
begin
 insert into public.knowledge_documents(team_id,name,chunks_count) values(p_team,p_name,jsonb_array_length(p_chunks)) returning id into doc;
 insert into public.document_chunks(team_id,document_id,chunk_index,chunk_text) select p_team,doc,ordinality-1,value#>>'{}' from jsonb_array_elements(p_chunks) with ordinality;
 return doc;
end $$;
create function public.match_document_chunks(query_embedding vector(1536),p_team_id uuid,match_count integer default 4) returns table(id uuid,document_id uuid,chunk_text text,similarity float) language sql stable security invoker set search_path=public as $$
 select c.id,c.document_id,c.chunk_text,1-(c.embedding<=>query_embedding) from public.document_chunks c where c.team_id=p_team_id and c.embedding is not null order by c.embedding<=>query_embedding limit least(greatest(match_count,1),8)
$$;
create function public.redeem_extension(p_code text,p_hash text) returns uuid language plpgsql security invoker set search_path='' as $$
declare c public.extension_codes;tokenid uuid;
begin
 delete from public.extension_codes where code_hash=p_code and expires_at>now() returning * into c;
 if not found then raise exception 'INVALID_CODE';end if;
 insert into public.extension_tokens(team_id,user_id,token_hash,expires_at) values(c.team_id,c.user_id,p_hash,now()+interval '7 days') returning id into tokenid;
 return tokenid;
end $$;
create function public.accept_invite(p_hash text,p_user uuid,p_email text) returns uuid language plpgsql security invoker set search_path='' as $$
declare inv public.team_invites; seats integer;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 select * into inv from public.team_invites where token_hash=p_hash and lower(email)=lower(p_email) and accepted_at is null and expires_at>now() for update;
 if not found then raise exception 'INVALID_INVITE';end if;
 select seat_limit into seats from public.teams where id=inv.team_id and not frozen for update;
 if not found then raise exception 'WORKSPACE_DISABLED';end if;
 if (select count(*) from public.users where team_id=inv.team_id)>=seats then raise exception 'NO_SEAT_AVAILABLE';end if;
 if exists(select 1 from public.users where id=p_user) then raise exception 'ALREADY_IN_WORKSPACE';end if;
 insert into public.users(id,team_id,email,role) values(p_user,inv.team_id,lower(p_email),inv.role);
 insert into public.team_members(team_id,user_id,role) values(inv.team_id,p_user,inv.role);
 update public.team_invites set accepted_at=now() where id=inv.id;return inv.team_id;
end $$;
create function public.apply_subscription(p_event text,p_created bigint,p_customer text,p_subscription text,p_active boolean,p_seats integer) returns boolean language plpgsql security invoker set search_path='' as $$
begin
 insert into public.webhook_events(id) values(p_event) on conflict do nothing;if not found then return false;end if;
 update public.teams set seat_limit=case when p_active then least(greatest(p_seats,1),100) else 1 end,plan=case when p_active then 'team' else 'free' end,monthly_draft_limit=case when p_active then least(greatest(p_seats,1),100)*1000 else 50 end,stripe_subscription_id=case when p_active then p_subscription else null end,billing_event_at=p_created where stripe_customer_id=p_customer and billing_event_at<=p_created;
 return true;
end $$;
create function public.cleanup_retention() returns void language plpgsql security invoker set search_path='' as $$
declare stale record;
begin
 for stale in select team_id,id from public.draft_history where status='pending' and created_at<now()-interval '10 minutes' loop perform public.fail_draft(stale.team_id,stale.id);end loop;
 delete from public.draft_history h using public.teams t where h.team_id=t.id and h.created_at<now()-make_interval(days=>t.retention_days);
 delete from public.rate_limits where window_start<now()-interval '1 day';
 delete from public.extension_codes where expires_at<now();
 delete from public.extension_tokens where expires_at<now()-interval '30 days';
 delete from public.team_invites where expires_at<now()-interval '30 days';
 delete from public.audit_events where created_at<now()-interval '90 days';
end $$;
create function public.manage_member(p_team uuid,p_actor uuid,p_target uuid,p_action text,p_role text default null) returns void language plpgsql security invoker set search_path='' as $$
declare actor_role text; target_role text;
begin
 perform 1 from public.teams where id=p_team for update;
 select role into actor_role from public.users where id=p_actor and team_id=p_team;
 select role into target_role from public.users where id=p_target and team_id=p_team;
 if actor_role is null or actor_role not in ('owner','admin') or target_role is null or target_role='owner' or p_actor=p_target then raise exception 'FORBIDDEN';end if;
 if p_action='remove' then
   if actor_role='admin' and target_role<>'member' then raise exception 'FORBIDDEN';end if;
   delete from public.users where id=p_target and team_id=p_team;
 elsif p_action='role' and actor_role='owner' and p_role in ('admin','member') then
   update public.users set role=p_role where id=p_target and team_id=p_team;
   update public.team_members set role=p_role where user_id=p_target and team_id=p_team;
 else raise exception 'FORBIDDEN';end if;
end $$;
create function public.has_workspace_seat(p_team uuid,p_user uuid) returns boolean language sql stable security invoker set search_path='' as $$
 select exists(select 1 from (select u.id,row_number() over(order by case when u.role='owner' then 0 else 1 end,u.created_at,u.id) as seat from public.users u where u.team_id=p_team) ranked join public.teams t on t.id=p_team where ranked.id=p_user and ranked.seat<=t.seat_limit)
$$;
-- Lock down every new RPC explicitly, including implicit PUBLIC execution privileges.
do $$ declare r record;begin
 for r in select oid::regprocedure as signature from pg_proc where pronamespace='public'::regnamespace and proname in ('provision_workspace','reserve_draft','fail_draft','consume_rate_limit','add_knowledge','redeem_extension','accept_invite','apply_subscription','cleanup_retention','match_document_chunks','manage_member','has_workspace_seat') loop
 execute format('revoke all on function %s from public, anon, authenticated',r.signature);
 execute format('grant execute on function %s to service_role',r.signature);
 end loop;
end $$;
grant execute on function public.match_document_chunks(vector,uuid,integer) to authenticated;
commit;
