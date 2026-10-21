-- Reasoning and visible reply tokens share a bounded output budget.
alter table public.platform_settings drop constraint platform_settings_max_output_tokens_check;
alter table public.platform_settings add constraint platform_settings_max_output_tokens_check check(max_output_tokens between 100 and 4096);
with changed as (
 update public.platform_settings set max_output_tokens=2048
 where id=true and active_provider='openrouter' and active_model='z-ai/glm-5.3' and max_output_tokens=600
 returning id
)
insert into public.audit_events(action,resource_id,details)
select 'pipeline.output_budget_repair','platform_settings', '{"previous":600,"current":2048,"reason":"Reasoning model exhausted visible reply budget"}'::jsonb from changed;
