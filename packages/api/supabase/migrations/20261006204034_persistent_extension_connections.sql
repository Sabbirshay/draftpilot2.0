-- Persistent device connections remain revocable; expired/revoked credentials are not revived.
alter table public.extension_tokens alter column expires_at drop not null;
update public.extension_tokens set expires_at=null where revoked_at is null and expires_at>now();
create or replace function public.redeem_extension(p_code text,p_hash text) returns uuid language plpgsql security invoker set search_path='' as $$
declare c public.extension_codes;tokenid uuid;
begin
 delete from public.extension_codes where code_hash=p_code and expires_at>now() returning * into c;
 if not found then raise exception 'INVALID_CODE';end if;
 insert into public.extension_tokens(team_id,user_id,token_hash,expires_at) values(c.team_id,c.user_id,p_hash,null) returning id into tokenid;
 return tokenid;
end $$;
revoke all on function public.redeem_extension(text,text) from public,anon,authenticated;
grant execute on function public.redeem_extension(text,text) to service_role;
