-- Additive, once-only migration. Apply with the Supabase migration runner.
-- Host authorization must provision memberships; the browser never writes them.
begin;
create schema mcp_store_private;
revoke all on schema mcp_store_private from public, anon, authenticated, service_role;
grant usage on schema mcp_store_private to service_role;
alter default privileges in schema mcp_store_private revoke all on tables from public, anon, authenticated;
alter default privileges in schema mcp_store_private revoke execute on functions from public, anon, authenticated;

create table public.mcp_store_tenants (
  id uuid primary key default gen_random_uuid(),
  project_key text not null check (project_key ~ '^[a-z][a-z0-9_-]{1,62}$'),
  created_at timestamptz not null default now()
);
create table public.mcp_store_memberships (
  tenant_id uuid not null references public.mcp_store_tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (tenant_id, user_id)
);
create index mcp_store_memberships_user on public.mcp_store_memberships(user_id, tenant_id);

create table public.mcp_store_installations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.mcp_store_tenants(id) on delete cascade,
  provider text not null check (provider ~ '^[a-z][a-z0-9_-]{1,62}$'),
  status text not null default 'not_connected'
    check (status in ('not_connected', 'connected', 'reconnect', 'manual', 'unavailable')),
  account_label text check (length(account_label) <= 200),
  last_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, provider),
  unique (tenant_id, id),
  check (status <> 'connected' or last_verified_at is not null)
);

-- Only secret-manager references. Never put tokens, keys or PKCE verifiers here.
create table mcp_store_private.credentials (
  tenant_id uuid not null,
  installation_id uuid not null,
  secret_id uuid not null unique,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, installation_id),
  foreign key (tenant_id, installation_id)
    references public.mcp_store_installations(tenant_id, id) on delete cascade
);

create table mcp_store_private.oauth_transactions (
  nonce_sha256 text primary key check (nonce_sha256 ~ '^[a-f0-9]{64}$'),
  tenant_id uuid not null,
  actor_id uuid not null,
  provider text not null check (provider ~ '^[a-z][a-z0-9_-]{1,62}$'),
  cookie_sha256 text not null check (cookie_sha256 ~ '^[a-f0-9]{64}$'),
  redirect_uri text not null check (redirect_uri like 'https://%' and length(redirect_uri) <= 2048),
  resource text not null check (resource like 'https://%' and length(resource) <= 2048),
  issuer text not null check (issuer like 'https://%' and length(issuer) <= 2048),
  scopes_sha256 text not null check (scopes_sha256 ~ '^[a-f0-9]{64}$'),
  verifier_secret_id uuid not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  foreign key (tenant_id, actor_id)
    references public.mcp_store_memberships(tenant_id, user_id) on delete cascade,
  check (expires_at >= created_at + interval '1 minute'
    and expires_at <= created_at + interval '30 minutes')
);
create index mcp_store_oauth_actor on mcp_store_private.oauth_transactions(tenant_id, actor_id);
create index mcp_store_oauth_expiry on mcp_store_private.oauth_transactions(expires_at);

create table mcp_store_private.audit_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.mcp_store_tenants(id) on delete cascade,
  installation_id uuid,
  event text not null check (event in ('installation_created', 'installation_updated', 'installation_deleted', 'oauth_consumed')),
  occurred_at timestamptz not null default now()
);
create index mcp_store_audit_tenant_time on mcp_store_private.audit_events(tenant_id, occurred_at);

alter table public.mcp_store_tenants enable row level security;
alter table public.mcp_store_memberships enable row level security;
alter table public.mcp_store_installations enable row level security;
alter table mcp_store_private.credentials enable row level security;
alter table mcp_store_private.oauth_transactions enable row level security;
alter table mcp_store_private.audit_events enable row level security;

revoke all on public.mcp_store_tenants, public.mcp_store_memberships, public.mcp_store_installations
  from public, anon, authenticated, service_role;
revoke all on all tables in schema mcp_store_private from public, anon, authenticated, service_role;
grant select on public.mcp_store_tenants, public.mcp_store_memberships, public.mcp_store_installations to authenticated;
grant select, insert, update, delete on public.mcp_store_tenants, public.mcp_store_memberships,
  public.mcp_store_installations to service_role;
grant select, insert, update, delete on mcp_store_private.credentials,
  mcp_store_private.oauth_transactions to service_role;
grant select, insert on mcp_store_private.audit_events to service_role;

create policy mcp_store_own_membership on public.mcp_store_memberships
  for select to authenticated using (user_id = (select auth.uid()));
create policy mcp_store_member_tenant on public.mcp_store_tenants
  for select to authenticated using (exists (
    select 1 from public.mcp_store_memberships m where m.tenant_id = id and m.user_id = (select auth.uid())
  ));
create policy mcp_store_member_installation on public.mcp_store_installations
  for select to authenticated using (exists (
    select 1 from public.mcp_store_memberships m
    where m.tenant_id = mcp_store_installations.tenant_id and m.user_id = (select auth.uid())
  ));

-- RPCs are invoker-rights: grants + the backend's service role are both required.
-- Never expose service-role credentials to browsers or accept tenant IDs unchecked.
create function public.mcp_store_consume_oauth(
  p_nonce_sha256 text, p_tenant_id uuid, p_actor_id uuid, p_provider text,
  p_cookie_sha256 text, p_redirect_uri text, p_resource text, p_issuer text, p_scopes_sha256 text
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare secret_ref uuid;
begin
  delete from mcp_store_private.oauth_transactions t
    where t.nonce_sha256 = p_nonce_sha256 and t.tenant_id = p_tenant_id
      and t.actor_id = p_actor_id and t.provider = p_provider
      and t.cookie_sha256 = p_cookie_sha256 and t.redirect_uri = p_redirect_uri
      and t.resource = p_resource and t.issuer = p_issuer and t.scopes_sha256 = p_scopes_sha256
      and t.created_at <= clock_timestamp() and t.expires_at > clock_timestamp()
    returning t.verifier_secret_id into secret_ref;
  if secret_ref is not null then
    insert into mcp_store_private.audit_events(tenant_id, event) values (p_tenant_id, 'oauth_consumed');
  end if;
  return secret_ref;
end;
$$;
revoke all on function public.mcp_store_consume_oauth(text, uuid, uuid, text, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.mcp_store_consume_oauth(text, uuid, uuid, text, text, text, text, text, text) to service_role;

create function mcp_store_private.record_installation_change()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if exists (select 1 from public.mcp_store_tenants where id = old.tenant_id) then
      insert into mcp_store_private.audit_events(tenant_id, installation_id, event)
        values (old.tenant_id, old.id, 'installation_deleted');
    end if;
    return old;
  end if;
  new.updated_at = clock_timestamp();
  insert into mcp_store_private.audit_events(tenant_id, installation_id, event)
    values (new.tenant_id, new.id, case when tg_op = 'INSERT' then 'installation_created' else 'installation_updated' end);
  return new;
end;
$$;
revoke all on function mcp_store_private.record_installation_change() from public, anon, authenticated;
grant execute on function mcp_store_private.record_installation_change() to service_role;
create trigger mcp_store_installation_audit before insert or update or delete
  on public.mcp_store_installations for each row execute function mcp_store_private.record_installation_change();
commit;
