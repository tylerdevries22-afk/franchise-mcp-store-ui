begin;
create function pg_temp.must_fail_vault(query text, expected_state text) returns void language plpgsql as $$
begin
  begin execute query;
  exception when others then
    if sqlstate=expected_state then return; end if;
    raise;
  end;
  raise exception 'Expected failure with SQLSTATE %', expected_state;
end;
$$;
set local role authenticated;
select pg_temp.must_fail_vault('select public.mcp_store_read_credential(null,null)', '42501');
select pg_temp.must_fail_vault('select public.mcp_store_save_credential(null,null,null)', '42501');
select pg_temp.must_fail_vault('select public.mcp_store_delete_credential(null,null)', '42501');
select pg_temp.must_fail_vault('select * from vault.decrypted_secrets', '42501');
set local role service_role;
do $$ begin
  assert public.mcp_store_read_credential('22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111') is null, 'Cross-tenant reference denied';
end $$;
select pg_temp.must_fail_vault('select public.mcp_store_save_credential(''22222222-2222-4222-8222-222222222222'',''11111111-1111-4111-8111-111111111111'',''test-only-secret'')','22023');
select pg_temp.must_fail_vault('select public.mcp_store_save_credential(''11111111-1111-4111-8111-111111111111'',''11111111-1111-4111-8111-111111111111'',null)','22023');
select public.mcp_store_save_credential('11111111-1111-4111-8111-111111111111','11111111-1111-4111-8111-111111111111','test-only-rotated');
do $$ begin
  assert public.mcp_store_read_credential('11111111-1111-4111-8111-111111111111','11111111-1111-4111-8111-111111111111')='test-only-rotated', 'Rotation persisted';
end $$;
select public.mcp_store_save_credential('22222222-2222-4222-8222-222222222222','22222222-2222-4222-8222-222222222222','test-only-second');
select pg_temp.must_fail_vault('update mcp_store_private.credentials set secret_id=gen_random_uuid()', '42501');
reset role;
do $$ begin
  assert (select count(*) from vault.secrets)=2, 'Rotation does not leak extra secret records';
end $$;
set local role service_role;
select public.mcp_store_delete_credential('11111111-1111-4111-8111-111111111111','11111111-1111-4111-8111-111111111111');
delete from public.mcp_store_tenants where id='22222222-2222-4222-8222-222222222222';
reset role;
do $$ begin
  assert (select count(*) from vault.secrets)=0, 'Disconnect and tenant delete clean up secrets';
end $$;
rollback;
