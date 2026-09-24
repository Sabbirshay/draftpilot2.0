begin;
-- Content-free accounting. Only the trusted API service may read or write it.
create table public.ai_usage_events (
 id uuid primary key,
 provider text not null check(provider in ('openai','openrouter')),
 model text not null check(length(model) between 1 and 120),
 kind text not null check(kind in ('chat','embedding')),
 status text not null default 'pending' check(status in ('pending','completed','failed')),
 input_tokens bigint check(input_tokens between 0 and 1000000000),
 output_tokens bigint check(output_tokens between 0 and 1000000000),
 total_tokens bigint check(total_tokens between 0 and 2000000000),
 cost_usd numeric(20,10) check(cost_usd between 0 and 1000000),
 cost_basis text not null default 'unknown' check(cost_basis in ('reported','estimated','unknown')),
 created_at timestamptz not null default now(),
 completed_at timestamptz,
 check ((cost_basis='unknown' and cost_usd is null) or (cost_basis<>'unknown' and cost_usd is not null))
);
alter table public.ai_usage_events enable row level security;
revoke all on public.ai_usage_events from public,anon,authenticated;
grant select,insert,update on public.ai_usage_events to service_role;
create index ai_usage_events_created_idx on public.ai_usage_events(created_at);
create index draft_history_completed_created_idx on public.draft_history(created_at) where status in ('draft','reviewed');
-- Retention/deletion of draft content must not erase operational counters.
create table public.platform_draft_totals (
 month date primary key,
 completed bigint not null default 0 check(completed >= 0)
);
alter table public.platform_draft_totals enable row level security;
revoke all on public.platform_draft_totals from public,anon,authenticated;
grant select,insert,update on public.platform_draft_totals to service_role;
alter table public.draft_history add column counted_complete boolean not null default false;
insert into public.platform_draft_totals(month,completed)
 select date_trunc('month',created_at at time zone 'UTC')::date,count(*) from public.draft_history
 where status in ('draft','reviewed') group by 1;
update public.draft_history set counted_complete=true where status in ('draft','reviewed');
create function public.count_completed_draft() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='UPDATE' then new.counted_complete=old.counted_complete; else new.counted_complete=false; end if;
 if new.status in ('draft','reviewed') and not new.counted_complete then
  insert into public.platform_draft_totals(month,completed) values(date_trunc('month',new.created_at at time zone 'UTC')::date,1)
   on conflict(month) do update set completed=public.platform_draft_totals.completed+1;
  new.counted_complete=true;
 end if;
 return new;
end $$;
revoke all on function public.count_completed_draft() from public,anon,authenticated;
grant execute on function public.count_completed_draft() to service_role;
create trigger count_completed_draft before insert or update on public.draft_history for each row execute function public.count_completed_draft();
create function public.admin_live_metrics() returns jsonb language sql stable security invoker set search_path='' as $$
 with period as (select date_trunc('month',now() at time zone 'UTC') at time zone 'UTC' start_at),
 ai as (select * from public.ai_usage_events where created_at >= (select start_at from period))
 select jsonb_build_object(
  'draftsCompleted',(select coalesce(sum(completed),0) from public.platform_draft_totals where month=date_trunc('month',now() at time zone 'UTC')::date),
  'aiCalls',(select count(*) from ai),
  'inputTokens',(select coalesce(sum(input_tokens),0) from ai),
  'outputTokens',(select coalesce(sum(output_tokens),0) from ai),
  'totalTokens',(select coalesce(sum(total_tokens),0) from ai),
  'reportedCostUsd',(select coalesce(sum(cost_usd) filter(where cost_basis='reported'),0) from ai),
  'estimatedCostUsd',(select coalesce(sum(cost_usd) filter(where cost_basis='estimated'),0) from ai),
  'unpricedCalls',(select count(*) from ai where cost_usd is null),
  'unmeteredCalls',(select count(*) from ai where total_tokens is null),
  'pendingCalls',(select count(*) from ai where status='pending'),
  'failedCalls',(select count(*) from ai where status='failed'),
  'trackingSince',(select min(created_at) from public.ai_usage_events),
  'monthStart',(select start_at from period)
 )
$$;
revoke all on function public.admin_live_metrics() from public,anon,authenticated;
grant execute on function public.admin_live_metrics() to service_role;
commit;
