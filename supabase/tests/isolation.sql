begin;
create function pg_temp.must_fail(query text, expected_state text) returns void language plpgsql as $$
begin
  begin
    execute query;
  exception when others then
    if sqlstate = expected_state then return; end if;
    raise;
  end;
  raise exception 'Expected failure with SQLSTATE %', expected_state;
end;
$$;
set local role anon;
select pg_temp.must_fail('select * from public.mcp_store_installations', '42501');
select pg_temp.must_fail('select * from mcp_store_private.credentials', '42501');
set local role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
do $$ begin
  assert (select count(*) from public.mcp_store_installations) = 1, 'Tenant A sees exactly its installation';
  assert (select count(*) from public.mcp_store_tenants) = 1, 'Tenant A sees exactly its tenant';
  assert (select count(*) from public.mcp_store_memberships) = 1, 'Tenant A sees exactly its membership';
  assert not exists(select 1 from public.mcp_store_installations where tenant_id='22222222-2222-4222-8222-222222222222'), 'No cross-tenant read';
end $$;
select pg_temp.must_fail('select * from mcp_store_private.credentials', '42501');
select pg_temp.must_fail('select * from mcp_store_private.oauth_transactions', '42501');
select pg_temp.must_fail('select * from mcp_store_private.audit_events', '42501');
select pg_temp.must_fail('update public.mcp_store_installations set status=''manual''', '42501');
select pg_temp.must_fail('delete from public.mcp_store_installations', '42501');
select pg_temp.must_fail('insert into public.mcp_store_memberships values (''22222222-2222-4222-8222-222222222222'',''aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'', now())', '42501');
select pg_temp.must_fail('select public.mcp_store_consume_oauth(null,null,null,null,null,null,null,null,null)', '42501');
set local request.jwt.claim.sub = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
do $$ begin
  assert (select id from public.mcp_store_installations) = '22222222-2222-4222-8222-222222222222'::uuid, 'Tenant B isolation';
end $$;
set local request.jwt.claim.sub = '';
do $$ begin
  assert (select count(*) from public.mcp_store_installations) = 0, 'Unauthenticated JWT cannot read';
end $$;
set local role service_role;
select pg_temp.must_fail('insert into public.mcp_store_installations(tenant_id,provider) values (''11111111-1111-4111-8111-111111111111'',''slack'')', '23505');
select pg_temp.must_fail('update public.mcp_store_installations set status=''connected''', '23514');
select pg_temp.must_fail('update mcp_store_private.credentials set tenant_id=''22222222-2222-4222-8222-222222222222''', '23503');
select pg_temp.must_fail('delete from mcp_store_private.audit_events', '42501');
select pg_temp.must_fail('truncate mcp_store_private.audit_events', '42501');
select pg_temp.must_fail('truncate mcp_store_private.credentials', '42501');
delete from public.mcp_store_tenants where id='22222222-2222-4222-8222-222222222222';
do $$ begin
  assert (select count(*) from public.mcp_store_installations) = 1, 'Tenant cleanup cascades without orphan installations';
end $$;
rollback;
