-- TEST DOUBLE ONLY. Proves RPC authorization/transactions, NOT Vault encryption.
create schema vault;
create table vault.secrets(id uuid primary key default gen_random_uuid(), secret text not null);
create view vault.decrypted_secrets as select id, secret as decrypted_secret from vault.secrets;
-- Signatures match supabase/vault sql/supabase_vault--0.3.0.sql, including unused key ID.
create function vault.create_secret(new_secret text, new_name text default null,
  new_description text default '', new_key_id uuid default null)
returns uuid language sql as $$
  insert into vault.secrets(secret) values(new_secret) returning id
$$;
create function vault.update_secret(secret_id uuid, new_secret text default null,
  new_name text default null, new_description text default null, new_key_id uuid default null)
returns void language sql as $$
  update vault.secrets set secret=new_secret where id=secret_id
$$;
insert into vault.secrets values ('33333333-3333-4333-8333-333333333333','test-only-original');
