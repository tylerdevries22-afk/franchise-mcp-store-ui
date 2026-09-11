# Supabase storage contract

## Host install (automated copy)

One-command install copies **byte-identical** packaged SQL into a host migrations
directory and writes a SHA-256 provenance manifest. Prefer this over hand-copying.

```sh
npm run host:install-migrations -- \
  --host-migrations /path/to/host/supabase/migrations \
  --include-vault \
  --write-provenance /path/to/host/supabase/.mcp-store-provenance.json
```

Rules:

- Copied files are content-identical to `supabase/migrations/*` and (when requested)
  `supabase/optional/vault.sql`. Only the host filename timestamp changes.
- Never edit an applied version; future package schema changes require a **forward**
  migration generated from a newer package release.
- Host adapters (e.g. Elevate `webdev_app` grants, location/`project_key` bridges)
  stay in **separate** host-owned migrations — do not fold them into the package copy.
- Re-running against a directory that already has identical hashes is a no-op skip
  unless `--force` is passed.

### Local Vault shim (CI / developer Postgres only)

`supabase/bootstrap/local/vault_shim.sql` provides plaintext stand-ins for
`vault.create_secret`, `vault.update_secret`, and `vault.decrypted_secrets` so
local hosts can apply the optional Vault migration without the hosted extension.
**Never apply the shim to hosted Supabase.** Production must enable the real Vault
extension, then apply `optional/vault.sql` as a versioned migration.

### Verify

```sh
DATABASE_URL=postgres://… npm run db:verify
# or: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f node_modules/franchise-mcp-store-ui/supabase/verify.sql
```

---


Apply to a disposable staging project first using its normal migration runner.
Install via `npm run host:install-migrations` (or copy
`supabase/migrations/202609080001_mcp_store.sql` once), preserving content/hash. Never rerun or edit an applied version;
future changes require a forward migration. Direct duplicate execution fails loudly.
Scripts are transactional and additive to existing application tables. They require
the standard Supabase `anon`, `authenticated`, `service_role`, `auth.users`, and
`auth.uid()` objects. They do not create production users or seed memberships.

If using Vault, enable the Supabase Vault extension first, then add the contents
of `supabase/optional/vault.sql` as the next versioned host migration. It fails
closed if Vault's expected APIs are absent. This is optional only when a different
server-side secret manager owns encryption; storing plaintext in public tables is
never an alternative. Run `supabase/verify.sql` with a trusted operator connection
afterward. It is read-only and prints schema/grant booleans and transaction counts.

| Object | Purpose | Browser access |
| --- | --- | --- |
| `public.mcp_store_tenants` | Host organization mapping | Membership-scoped read |
| `public.mcp_store_memberships` | Authoritative tenant membership | Own memberships only |
| `public.mcp_store_installations` | Safe status and account label | Membership-scoped read |
| `mcp_store_private.credentials` | Secret-manager UUID references | None |
| `mcp_store_private.oauth_transactions` | Bound, expiring nonce records | None |
| `mcp_store_private.audit_events` | Redacted installation/callback history | None |

Do not add `mcp_store_private` or `vault` to PostgREST's exposed schemas. Keep
service-role keys in server environment variables. With Vault installed, direct
credential-reference writes are revoked and callers use these service-only RPCs:

| RPC | Inputs | Result |
| --- | --- | --- |
| `mcp_store_save_credential` | tenant UUID, installation UUID, secret text | Saves or rotates atomically; no secret result |
| `mcp_store_read_credential` | tenant UUID, installation UUID | Secret text to trusted backend only |
| `mcp_store_delete_credential` | tenant UUID, installation UUID | Removes secret and marks disconnected |
| `mcp_store_consume_oauth` | nonce hash, tenant, actor, provider, cookie hash, redirect, resource, issuer, scope hash | Verifier reference once, or null |

Parameterize all calls. Never log request bodies for credential RPCs or enable
SQL parameter/statement logging that captures tokens. A backend with the service
role remains trusted to authorize the end user: these RPCs do not authenticate HTTP
requests. Security-definer Vault functions use an empty search path, fixed object
names, and explicitly revoked PUBLIC/anon/authenticated execution.

Credential writes serialize on the installation row. Disconnect and installation/
tenant deletion clean up Vault credentials. Verify old references resolve before
adopting Vault on preexisting data; the adapter will reject rotation of a missing
secret instead of silently claiming success. Backend reads cannot distinguish an
absent credential from an absent Vault record without an integrity check.

The core audit trail covers installation mutations and successful nonce consumption.
It is not a compliance-grade immutable log: tenant deletion purges it, database
operators can alter it, and Vault rotation/read attempts are not automatically logged.
Export security events to a separate sink if retention beyond tenant deletion is needed.

## Retention and backups

The host must schedule bounded cleanup of expired OAuth transactions and their
verifier secrets, reconcile orphaned secrets, and set an audit retention policy.
Never indiscriminately delete all Vault entries: it may also hold other apps' data.
Provider revocation must happen before local deletion when supported. Removing a
stored token does not revoke it at the provider.

Enable the required backup/PITR plan, test restoration into an isolated project,
and verify RLS/grants, Vault decryption, membership revocation and representative
data counts. Supabase database backups do not include Storage API object contents;
back up those separately. Keep encryption recovery arrangements with the secrets
system; a local SQL dump test cannot certify hosted Vault key recovery.

References: [RLS and grants](https://supabase.com/docs/guides/database/postgres/row-level-security),
[Vault access and encryption](https://supabase.com/docs/guides/database/vault),
[backup coverage](https://supabase.com/docs/guides/platform/backups).
