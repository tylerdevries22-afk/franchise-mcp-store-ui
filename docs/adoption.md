# Reuse in another repository

Install a reviewed tarball produced by `npm pack`, or pin the Git dependency to a
full reviewed commit. Version 1.3.0 in this branch is a release candidate; a matching
published registry release/tag must exist before using `@1.3.0` as an install command.

```sh
npm install /absolute/path/franchise-mcp-store-ui-1.3.0.tgz
```

The React entry requires React 19 and CSS Modules. The `/oauth` entry supports Node
22+ without React, CSS or a TS loader; import it only in server routes. Browser
bundlers deliberately cannot resolve that entry. This is ESM-only. Non-React
repositories can use the SQL contract independently, but cannot render this UI.

```tsx
import { McpStore, type McpStoreEntry } from 'franchise-mcp-store-ui';

const entries: McpStoreEntry[] = [{
  id: 'github', name: 'GitHub', description: 'Repository access', type: 'Development',
  status: 'not_connected', connectHref: '/api/connect/github/start',
}];
// That route must exist and enforce host authorization before offering the action.
export function Integrations() { return <McpStore entries={entries} />; }
```

## Host contract

- Derive user and tenant identity from a verified server session. Provision and
  remove `mcp_store_memberships` from authoritative host membership changes.
  Never create membership from an unverified request body or editable JWT metadata.
- When sharing a database, map each host organization to a distinct `tenant_id`
  and fixed `project_key`. Never reuse tenant IDs across unrelated applications.
  A service role bypasses RLS across the project: separate Supabase projects are
  the stronger isolation boundary when backends do not share the same trust.
- Validate catalog input and approve external link destinations server-side. UI
  URL checks block unsafe schemes; they do not certify that an HTTPS host is trusted.
- Show a Connect link only for a configured provider route; use `detailHref` for
  documentation/review. Mark `connected` only after a successful authenticated
  provider identity/scope probe. SQL's timestamp constraint is not proof of a probe.
- Enforce tenant authorization, CSRF protection, origin/CORS policy, rate limits,
  scopes, payload limits, network timeouts and bounded transient retries in routes.
  Retry idempotent reads; code exchanges and writes need provider idempotency or
  reconciliation before retrying after an uncertain response.
- Keep tokens and PKCE verifiers server-side in a secret manager. Never include
  credentials in entries, URLs, public columns, error text, logs or tracing payloads.

## Existing consumers

Stillpoint currently pins `v1.1.0`; Coffee Story uses its own
`packages/franchise-mcp-store-ui` workspace copy (1.2.0). Replace the duplication
with one reviewed package version as a separate consumer change. Run each host's
typecheck and browser tests, then its provider smoke matrix, before deployment.
Preserve each host's existing tables until a counted, validated backfill and rollback
plan is approved. The new schema does not migrate legacy `agent_ops` data automatically.

## OAuth callback sequence

1. Validate the server session, tenant access and exact configured redirect/provider.
2. Read `MCP_OAUTH_STATE_SECRET` from a secret environment variable (at least 32
   cryptographically random bytes). Create signed material and a Secure, HttpOnly,
   SameSite=Lax, short-lived host-only cookie. A `__Host-` cookie needs `Path=/`
   and no Domain attribute. Never put the code verifier into that cookie.
3. Store only nonce/cookie hashes and exact tenant, actor, provider, redirect,
   resource, issuer, scope hash and expiry in `oauth_transactions`. Store the PKCE
   verifier in Vault or another secret manager and persist its UUID reference.
4. At callback, verify signed state and cookie binding, current session membership,
   and the authorization-server issuer according to its metadata. Match the exact
   configured redirect/resource and sorted scope snapshot. Consume the transaction
   with the service-only `mcp_store_consume_oauth` RPC before exchanging a code.
5. If the returned reference is null, fail closed. Signature verification alone
   does not prevent replay. A crash after consumption requires a new OAuth flow.
6. Exchange the code using the stored verifier; verify provider identity and scopes;
   save credentials through the Vault RPC and then publish verified status. These
   two commits intentionally favor unconnected status on a crash; a reconciliation
   job may finish verification later. Never mark connected before saving credentials.
7. Delete expired/consumed verifier secrets, clear the browser cookie, and record a
   redacted outcome. PKCE secret cleanup is host-owned; the optional Vault adapter
   manages installation credentials only.

## Releases and host bumps

See [release-and-sync.md](release-and-sync.md) for version bumps, GitHub Release
tarballs, and automated PRs into Elevate, Coffee Story, and StillPoint.
