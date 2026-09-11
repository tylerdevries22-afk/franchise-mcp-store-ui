-- Minimal stand-in for Supabase Vault on plain PostgreSQL.
-- LOCAL / CI ONLY. Apply from host bootstrap (e.g. db-local) so migrations that
-- call vault.create_secret / vault.update_secret / vault.decrypted_secrets work
-- on disposable databases. Never apply to a hosted Supabase project — that
-- platform owns the real Vault extension.
--
-- Secrets are stored in plaintext here. Acceptable for disposable local/CI DBs;
-- never a substitute for production Vault.
-- Idempotent: safe to re-run.

CREATE SCHEMA IF NOT EXISTS vault;

CREATE TABLE IF NOT EXISTS vault.secrets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE,
  description text,
  secret text NOT NULL,
  key_id uuid,
  nonce bytea,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE VIEW vault.decrypted_secrets AS
SELECT
  id,
  name,
  description,
  secret,
  secret AS decrypted_secret,
  key_id,
  nonce,
  created_at,
  updated_at
FROM vault.secrets;

CREATE OR REPLACE FUNCTION vault.create_secret(
  new_secret text,
  new_name text DEFAULT NULL,
  new_description text DEFAULT NULL,
  new_key_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  secret_id uuid;
BEGIN
  INSERT INTO vault.secrets (secret, name, description, key_id)
  VALUES (new_secret, new_name, new_description, new_key_id)
  RETURNING id INTO secret_id;
  RETURN secret_id;
END;
$$;

CREATE OR REPLACE FUNCTION vault.update_secret(
  secret_id uuid,
  new_secret text DEFAULT NULL,
  new_name text DEFAULT NULL,
  new_description text DEFAULT NULL,
  new_key_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE vault.secrets
  SET
    secret = COALESCE(new_secret, secret),
    name = COALESCE(new_name, name),
    description = COALESCE(new_description, description),
    key_id = COALESCE(new_key_id, key_id),
    updated_at = clock_timestamp()
  WHERE id = secret_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING errcode = '22023', message = 'Secret not found.';
  END IF;
END;
$$;

REVOKE ALL ON SCHEMA vault FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA vault FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA vault FROM PUBLIC;
GRANT USAGE ON SCHEMA vault TO postgres, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON vault.secrets TO postgres, service_role;
GRANT SELECT ON vault.decrypted_secrets TO postgres, service_role;
GRANT EXECUTE ON FUNCTION vault.create_secret(text, text, text, uuid) TO postgres, service_role;
GRANT EXECUTE ON FUNCTION vault.update_secret(uuid, text, text, text, uuid) TO postgres, service_role;
