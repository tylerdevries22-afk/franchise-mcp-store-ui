# Verification and remaining release gates

`npm run test:coverage` exercises OAuth malformed inputs, signature framing,
expiry, provider binding, cookie names/binding, PKCE generation, navigation URLs,
search, selection, keyboard tabs, setup disclosures and multiple UI instances.
Coverage thresholds are enforced, including branches; no original test is removed.

`npm run test:package` packs the actual distribution, installs it in a new consumer,
imports OAuth in plain Node, bundles the UI and CSS for a browser, rejects a browser
OAuth import, renders React SSR and typechecks the consumer. This is a package/bundler
proof, not a full Next.js, Vite dev-server or interactive-browser certification.

`npm run test:db` uses real local PostgreSQL with a test identity function and a
Vault API double. It checks both tenants, anonymous denial, browser write denial,
private tables, grants, foreign keys, status constraints, all callback bindings,
expiry, membership revocation, fault rollback, eight-way callback and credential
write races, duplicate migration rejection, and dump/restore retaining RLS.
The double stores test strings in plaintext and is NEVER a deployment artifact.
None of `supabase/tests` is included in the package tarball.

The production Supabase integration still requires:

- Apply and replay migration history on a disposable actual Supabase project;
  validate Auth JWT/REST roles and actual Vault encryption/decryption and key recovery.
- Use two real test users in distinct tenants to exercise REST reads and all denied
  writes/RPCs. Test membership removal during an in-flight OAuth callback.
- Verify provider account identity, scopes, token refresh, expiration, revocation,
  partial consent, duplicate webhooks and bounded transient failures for every adapter.
- For an HTTP MCP server, run protocol conformance/Inspector against its actual
  endpoint: initialize/version negotiation, tools/list and permitted tools/call,
  schema errors, authentication/audience checks, unauthorized scope denial and
  session isolation. An HTTP 200 or a green catalog card is not this proof.
- Exercise rate limits, exact CORS/origin policy, SSRF controls on metadata/resource
  URLs, DNS rebinding, redirects, timeouts, payload limits and cancellation.
- Back up and restore actual data plus Storage objects; prove expected recovery
  objectives. Record counts, timestamps, migration version and provider test results.

Use [MCP Conformance](https://github.com/modelcontextprotocol/conformance) and
[Inspector](https://github.com/modelcontextprotocol/inspector) as test tooling,
pinning reviewed versions. Run against staging and keep Inspector bound to loopback.
Treat server descriptions and tool outputs as untrusted content; registry inclusion
is discovery, not a security certification.

GitHub CI now declares package, coverage, SQL, dependency and CodeQL checks. It must actually
run on the review branch before release; local success is not a hosted CI result.
Require passing Verify checks in the default branch ruleset and keep secret scanning/
push protection enabled. Dependabot config requests weekly npm and action updates.
