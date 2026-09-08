-- Read-only diagnostics. Run with a trusted operator connection after migration.
begin read only;
set local statement_timeout = '10s';
set local lock_timeout = '3s';
select c.relname as object, c.relrowsecurity as rls_enabled
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where (n.nspname='public' and c.relname in ('mcp_store_tenants','mcp_store_memberships','mcp_store_installations'))
   or (n.nspname='mcp_store_private' and c.relkind='r');
select
  not has_table_privilege('anon','public.mcp_store_installations','SELECT') as anonymous_denied,
  not has_table_privilege('authenticated','public.mcp_store_installations','INSERT,UPDATE,DELETE') as browser_writes_denied,
  not has_schema_privilege('authenticated','mcp_store_private','USAGE') as private_schema_denied,
  not has_function_privilege('authenticated','public.mcp_store_consume_oauth(text,uuid,uuid,text,text,text,text,text,text)','EXECUTE') as callback_rpc_denied;
select
  count(*) filter (where expires_at <= now()) as expired_oauth_transactions,
  count(*) as pending_oauth_transactions
from mcp_store_private.oauth_transactions;
commit;
