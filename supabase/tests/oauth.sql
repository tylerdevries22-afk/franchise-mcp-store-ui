begin;
set local role service_role;
do $$
declare result uuid; mismatch text;
begin
  foreach mismatch in array array['tenant','actor','provider','cookie','redirect','resource','issuer','scopes','nonce'] loop
    result = public.mcp_store_consume_oauth(
      case when mismatch='nonce' then repeat('d',64) else repeat('a',64) end,
      case when mismatch='tenant' then '22222222-2222-4222-8222-222222222222'::uuid else '11111111-1111-4111-8111-111111111111'::uuid end,
      case when mismatch='actor' then 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid else 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid end,
      case when mismatch='provider' then 'google' else 'slack' end,
      case when mismatch='cookie' then repeat('d',64) else repeat('b',64) end,
      case when mismatch='redirect' then 'https://evil.example' else 'https://app.example/callback' end,
      case when mismatch='resource' then 'https://evil.example' else 'https://mcp.example/mcp' end,
      case when mismatch='issuer' then 'https://evil.example' else 'https://issuer.example' end,
      case when mismatch='scopes' then repeat('d',64) else repeat('c',64) end);
    assert result is null, 'Mismatched binding must not consume: ' || mismatch;
    assert (select count(*) from mcp_store_private.oauth_transactions) = 1, 'Mismatch must preserve transaction';
  end loop;
end $$;
update mcp_store_private.oauth_transactions set created_at=now()-interval '20 minutes', expires_at=now()-interval '10 minutes';
do $$ begin
  assert public.mcp_store_consume_oauth(repeat('a',64),'11111111-1111-4111-8111-111111111111',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','slack',repeat('b',64),'https://app.example/callback',
    'https://mcp.example/mcp','https://issuer.example',repeat('c',64)) is null, 'Expired state rejected';
end $$;
delete from public.mcp_store_memberships where tenant_id='11111111-1111-4111-8111-111111111111';
do $$ begin
  assert (select count(*) from mcp_store_private.oauth_transactions) = 0, 'Revoked member cannot complete OAuth';
end $$;
rollback;
