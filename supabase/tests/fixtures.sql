insert into auth.users values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
set role service_role;
insert into public.mcp_store_tenants(id, project_key) values
  ('11111111-1111-4111-8111-111111111111', 'test-one'), ('22222222-2222-4222-8222-222222222222', 'test-two');
insert into public.mcp_store_memberships(tenant_id, user_id) values
  ('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  ('22222222-2222-4222-8222-222222222222','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
insert into public.mcp_store_installations(id, tenant_id, provider) values
  ('11111111-1111-4111-8111-111111111111','11111111-1111-4111-8111-111111111111','slack'),
  ('22222222-2222-4222-8222-222222222222','22222222-2222-4222-8222-222222222222','slack');
insert into mcp_store_private.credentials values (
  '11111111-1111-4111-8111-111111111111','11111111-1111-4111-8111-111111111111',
  '33333333-3333-4333-8333-333333333333', now());
insert into mcp_store_private.oauth_transactions
  (nonce_sha256, tenant_id, actor_id, provider, cookie_sha256, redirect_uri, resource, issuer, scopes_sha256, verifier_secret_id, expires_at)
  values (repeat('a',64),'11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'slack',repeat('b',64),'https://app.example/callback','https://mcp.example/mcp','https://issuer.example',repeat('c',64),
    '33333333-3333-4333-8333-333333333333', now() + interval '10 minutes');
reset role;
