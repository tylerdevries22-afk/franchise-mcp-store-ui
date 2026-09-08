begin;
create function pg_temp.reject_audit() returns trigger language plpgsql as $$
begin raise exception using errcode='P0001', message='Injected audit failure'; end;
$$;
create trigger inject_audit_failure before insert on mcp_store_private.audit_events
  for each row execute function pg_temp.reject_audit();
set local role service_role;
do $$
declare rejected boolean = false;
begin
  begin
    perform public.mcp_store_consume_oauth(repeat('a',64),'11111111-1111-4111-8111-111111111111',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','slack',repeat('b',64),'https://app.example/callback',
      'https://mcp.example/mcp','https://issuer.example',repeat('c',64));
  exception when raise_exception then rejected = true;
  end;
  assert rejected, 'Injected fault was reached';
  assert (select count(*) from mcp_store_private.oauth_transactions)=1, 'Audit failure rolls back nonce consumption';
end;
$$;
rollback;
