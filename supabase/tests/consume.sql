set role service_role;
select public.mcp_store_consume_oauth(repeat('a',64), '11111111-1111-4111-8111-111111111111',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'slack', repeat('b',64), 'https://app.example/callback',
  'https://mcp.example/mcp', 'https://issuer.example', repeat('c',64));
