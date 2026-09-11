# Franchise MCP Store UI

One visual source of truth for the searchable connector directory used by the
StillPoint integrations portal and organization onboarding flows. Consumers
own authentication, tenant data, navigation, and provider artwork; this package
owns the accessible layout and interaction model.

```tsx
<McpStore entries={entries} renderIcon={(entry, size) => <Logo id={entry.id} size={size} />} />
```

The package never receives secrets or decides tenant authorization. A host maps
its server-derived connector projection into `McpStoreEntry`, supplies a real
top-level `connectHref` only when that provider is configured, and reports
anything else as `unavailable`. Selection mode is for onboarding intent; it
does not start OAuth before the new organization exists.

## Setup guidance

An entry may carry an optional `setup` block, and the row then renders a
collapsed "How to connect" disclosure badged with the effort involved. The three
kinds describe what the reader has to do, not how the provider is built:

| `kind` | Badge | Use when |
| --- | --- | --- |
| `one-click-oauth` | One-click sign-in | The host holds the OAuth client, so Connect is one press |
| `api-key` | Paste an API key | The provider issues no OAuth client, so a key is copied across |
| `operator-portal` | Guided import | The provider publishes no API and data arrives by upload |

```tsx
<McpStore entries={[{
  id: 'transistor', name: 'Transistor', description: 'Podcast analytics',
  type: 'Marketing', status: 'not_connected',
  connectHref: '/integrations/transistor', connectLabel: 'Add API key',
  setup: {
    kind: 'api-key', estimatedMinutes: 2,
    steps: [{ text: 'Open your account page.', href: 'https://dashboard.transistor.fm/account' }],
    consoleHref: 'https://dashboard.transistor.fm/account',
    documentationHref: 'https://developers.transistor.fm/',
  },
}]} />
```

Steps are the host's copy. Keep each to one imperative line and link it to the
exact screen the reader needs; the component renders them in order and opens
every external link with `rel="noreferrer noopener"`. An entry with no `setup`,
or with an empty `steps` array, renders no disclosure. Selection mode omits
guidance entirely, because onboarding captures intent rather than credentials.

A provider with no API uses `status: 'manual'`, which reads as "Manual import"
rather than "Unavailable" and stays actionable when the host supplies a
`connectHref`. `SetupBadge`, `SetupDisclosure` and `setupKindLabel` are exported
for hosts that need the same badge or step list on a detail page.

`McpStoreEntry.setup` and the `manual` status are additive: an existing host
compiles and behaves unchanged without them.

The 1.3 package exports compiled ESM and TypeScript declarations. React consumers
need React 19 and a bundler that handles CSS Modules; server helpers need Node 22+.
The package no longer requires consumers to transpile raw TypeScript. It is not a
drop-in UI for non-React applications or a complete MCP gateway.

Pin one reviewed release or full commit across consumers. A workspace copy and
a Git dependency do not update together. See [adoption](docs/adoption.md) for
installation, host responsibilities, and compatibility checks. Release tagging,
GitHub Release tarballs, and host bump PRs are documented in
[release-and-sync](docs/release-and-sync.md).

Server routes may import `franchise-mcp-store-ui/oauth` for the shared signed
state, PKCE, nonce, and browser-binding primitives. The subpath is Node-only;
never import it from a client component.

## Persistence and verification

The optional [Supabase integration](docs/supabase.md) supplies tenant memberships,
safe installation projections, private secret references, atomic single-use OAuth
consumption, and an optional Vault adapter. The UI itself performs no database writes.
Use the host's authenticated backend to authorize and persist user intent.

```sh
npm ci
npm run lint
npm run typecheck
npm run test:coverage
npm run test:package
npm run test:db
npm audit --audit-level=moderate
```

Database tests create and stop their own local PostgreSQL cluster using a private
Unix socket. Set `MCP_STORE_PG_BIN` if PostgreSQL binaries are not discoverable.
They do not accept a database URL. Auth identity and Vault APIs are test doubles:
hosted JWT verification, real Vault encryption, and provider connectivity still
require a staging test. See [verification](docs/verification.md).

This package does not rotate provider tokens, run sync workers, back up Storage
objects, or certify third-party MCP servers. Those capabilities must be implemented
and verified by the host before it reports a connection as healthy.
