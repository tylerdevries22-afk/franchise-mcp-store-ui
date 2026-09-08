-- Optional Supabase-only integration, applied AFTER the core migration.
-- Enable Supabase Vault through the project's extension management first.
-- This intentionally fails closed on plain PostgreSQL without Vault.
begin;
do $$ begin
  if to_regprocedure('vault.create_secret(text,text,text,uuid)') is null
    or to_regprocedure('vault.update_secret(uuid,text,text,text,uuid)') is null
    or to_regclass('vault.decrypted_secrets') is null then
    raise exception using errcode='55000', message='Supabase Vault must be enabled before installing MCP credential RPCs.';
  end if;
end $$;

-- Serialized credential creation/rotation: never create an orphan if a write fails.
create function public.mcp_store_save_credential(p_tenant_id uuid, p_installation_id uuid, p_secret text)
returns void language plpgsql security definer set search_path = '' as $$
declare existing_secret uuid; new_secret uuid;
begin
  if p_secret is null or length(p_secret) < 1 or octet_length(p_secret) > 65536 then
    raise exception using errcode='22023', message='Invalid credential payload.';
  end if;
  perform 1 from public.mcp_store_installations where id=p_installation_id and tenant_id=p_tenant_id for update;
  if not found then
    raise exception using errcode='22023', message='Installation is unavailable.';
  end if;
  select secret_id into existing_secret from mcp_store_private.credentials
    where tenant_id=p_tenant_id and installation_id=p_installation_id;
  if existing_secret is null then
    select vault.create_secret(p_secret, null, 'MCP connector credential') into new_secret;
    insert into mcp_store_private.credentials(tenant_id, installation_id, secret_id)
      values (p_tenant_id, p_installation_id, new_secret);
  else
    if not exists(select 1 from vault.secrets where id=existing_secret) then
      raise exception using errcode='55000', message='Credential storage requires repair.';
    end if;
    perform vault.update_secret(existing_secret, p_secret, null, null);
    update mcp_store_private.credentials set updated_at=clock_timestamp()
      where tenant_id=p_tenant_id and installation_id=p_installation_id;
  end if;
end;
$$;

create function public.mcp_store_read_credential(p_tenant_id uuid, p_installation_id uuid)
returns text language sql security definer set search_path = '' as $$
  select s.decrypted_secret from mcp_store_private.credentials c
  join vault.decrypted_secrets s on s.id=c.secret_id
  where c.tenant_id=p_tenant_id and c.installation_id=p_installation_id
$$;

create function public.mcp_store_delete_credential(p_tenant_id uuid, p_installation_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.mcp_store_installations where id=p_installation_id and tenant_id=p_tenant_id for update;
  if not found then
    raise exception using errcode='22023', message='Installation is unavailable.';
  end if;
  delete from mcp_store_private.credentials where tenant_id=p_tenant_id and installation_id=p_installation_id;
  update public.mcp_store_installations set status='not_connected', account_label=null, last_verified_at=null
    where tenant_id=p_tenant_id and id=p_installation_id;
end;
$$;

-- Keep encrypted values from outliving their installation or tenant.
create function mcp_store_private.delete_vault_credential()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  delete from vault.secrets where id=old.secret_id;
  return old;
end;
$$;
create trigger mcp_store_credential_cleanup after delete on mcp_store_private.credentials
  for each row execute function mcp_store_private.delete_vault_credential();

revoke all on function public.mcp_store_save_credential(uuid,uuid,text),
  public.mcp_store_read_credential(uuid,uuid), public.mcp_store_delete_credential(uuid,uuid),
  mcp_store_private.delete_vault_credential() from public, anon, authenticated;
grant execute on function public.mcp_store_save_credential(uuid,uuid,text),
  public.mcp_store_read_credential(uuid,uuid), public.mcp_store_delete_credential(uuid,uuid) to service_role;
-- Once Vault owns writes, callers cannot replace a reference with an unrelated secret.
revoke insert, update, delete on mcp_store_private.credentials from service_role;
commit;
