# Franchise MCP Store Autonomy — Implementation Plan

**Date:** 2026-09-11 (America/Denver)  
**Owner:** Tyler / franchise MCP autonomy swarm  
**Package SSOT:** `franchise-mcp-store-ui` (Option D + Vault)  
**Machine:** `6fd7cdd5-23e0-49e8-b0b0-74f8a7484f0b`  
**Phase order:** package automation first → Elevate adopt → Coffee Story / Stillpoint adopt  

**Inputs folded in:**
- `_agent-data/audits/mcp-automation-blueprint-20260911/AUDIT.md` — no host-install CLI; CI `test:db` missing PG server; Elevate SQL hash drift
- `_agent-data/audits/mcp-franchise-package-20260911/AUDIT.md` — kit not control plane; no package catalog; pin/docs drift
- `_agent-data/audits/mcp-hosts-sync-20260911/AUDIT.md` — pin skew; CS/SP PKCE-in-cookie; Elevate Vault-aligned; no auto sync PRs
- `_agent-data/audits/mcp-connection-propagation-20260911/DESIGN.md` — **recommended:** shared provider registry + host overlays + CI sync PRs; preserve Elevate demote-unwired (#41)
- `_agent-data/audits/mcp-storage-20260911/OPTIONS.md` — Option D + Vault locked for Elevate; CS/SP persistence rewrite deferred

---

## 1. Goals

1. **`franchise-mcp-store-ui` is SSOT** for shared connector **catalog descriptors** + SQL/Vault contract (Option D + Vault).
2. **One-command host bootstrap** installs schemas/tables/Vault RPCs/grants/verify (+ local `vault_shim`).
3. **Advanced automated tests** in package CI (real PostgreSQL + `test:db`), with race/RLS coverage retained/extended.
4. **Adding a connector in the package** propagates metadata to Elevate, Coffee Story, Stillpoint via versioned publish + automated host sync PRs (Dependabot / GitHub Action bump PRs). Connectability stays host-certified.
5. **Hosts keep** OAuth client env + per-host tenant `project_key` namespaces.
6. **Elevate demote-unwired stays** until a connector is fully wired (`CONNECTABLE_PROVIDER_IDS` / overlay `connectable`).
7. **Phased rollout:** package automation (W1–W3) → Elevate adopt (W4) → CS/Stillpoint adopt (W5–W6).

## 2. Non-goals

- Changing Elevate / Coffee Story / Stillpoint app code in the **package-first** agent pass (separate swarm for W4–W6).
- Breaking or rewriting Option D + Vault semantics (byte-identical core SQL; host adapters stay host-only).
- Auto-enabling Connect across hosts when a catalog row is added (violates Elevate #41 honesty).
- Shipping plaintext `vault_shim` to hosted Supabase.
- Shared remote control-plane / Option E (deferred).
- Forcing Stillpoint id rename or CS/SP `mcp_store_*` migration in phase 1.
- Putting OAuth client secrets, redirect URIs, or env secret *values* in the shared registry.
- Merging hosts into one monorepo solely for catalog sync.

## 3. Architecture

```text
 franchise-mcp-store-ui (SSOT)
 ┌─────────────────────────────────────────────────────────┐
 │ UI (McpStore)  │  /oauth helpers  │  SQL + Vault contract │
 │ /catalog       │  host-install    │  vault_shim (local)   │
 │  descriptors   │  migrations CLI  │  verify / test:db     │
 └────────┬────────────────┬───────────────────┬───────────┘
          │ bump + sync PR │                   │
          ▼                ▼                   ▼
   Elevate overlay    CS overlay          Stillpoint overlay
   connectable=#41    canConfigure        authReady + aliases
   project_key=…      brand_id            organization_id
   OAuth+Vault        (PKCE fix later)    (PKCE fix later)
```

### 3.1 Catalog = registry + host overlays (DESIGN.md model 2)

**Shared descriptors** (package `/catalog`): canonical kebab ids (CS/Elevate vocabulary), name, type, description, `setupKind`, steps, console/docs URLs, `availabilityDefault`. Never secrets; never `connectHref`.

**Host overlay** (per app):
- `connectable` allowlist (Elevate `CONNECTABLE_PROVIDER_IDS` — demote unwired)
- `connectHref(id)` / route registration
- OAuth client env binding (names only)
- tenant/`project_key` mapping
- `aliases` (Stillpoint `gmail` → franchise `google-suite`, etc.)
- include/exclude + copy overrides
- installation status projection

**Projection:** `projectFranchiseCatalog(descriptors, overlay, installations?) → McpStoreEntry[]`  
Uncertified ids → `status: 'unavailable'`, `connectHref: null` (Elevate #41 preserved).

### 3.2 SQL distribution

- Package migrations remain **immutable upstream** (once-only `CREATE`; hash-stable).
- `scripts/host-install-migrations.mjs` copies **byte-identical** SQL into host `supabase/migrations/` with host-chosen timestamps + provenance manifest (SHA-256).
- Host adapters (`webdev_app`, location bridges) stay **separate** forward migrations.
- Local/CI only: packaged `supabase/bootstrap/local/vault_shim.sql` (plaintext stand-in; never hosted).

### 3.3 Propagation (DESIGN.md model 4 companion)

1. Register descriptor in package → release.
2. Release workflow / Dependabot / sync Action opens version-bump PRs on Elevate, CS, Stillpoint.
3. Hosts show new cards as unavailable until overlay certification.
4. Certify on a host → add to `connectable` + routes + Vault + probe tests.

### 3.4 Honest “add a connection”

| Step | Who | Result |
| --- | --- | --- |
| Register | Package catalog | Metadata appears after bump (unavailable) |
| Certify | Host overlay | Connect enabled on that host only |
| Promote | Optional playbooks / sync PRs | Other hosts certify independently |

## 4. Workstreams

### W1 — Host install / bootstrap (package)

**Deliverables**
- `scripts/host-install-migrations.mjs` — copy packaged core (+ optional vault) into `--host-migrations` dir; write `.mcp-store-provenance.json` (version, source paths, SHA-256, timestamps); refuse overwrite of same content under different name without `--force`; never mutate already-copied bytes.
- `supabase/bootstrap/local/vault_shim.sql` — Elevate-aligned local Vault shim (LOCAL/CI ONLY).
- `npm run db:verify` — apply/wrap `supabase/verify.sql` against a provided `DATABASE_URL` or print operator instructions; package script documented.
- Docs: `docs/supabase.md` + `docs/adoption.md` updated for one-command install, shim boundaries, provenance, stale consumer pins fixed.

**Acceptance**
- [ ] Running install against a temp dir yields byte-identical SQL vs package files (hash match).
- [ ] Provenance JSON records package version + hashes.
- [ ] `vault_shim.sql` is packaged for hosts’ local bootstrap; comments forbid hosted use.
- [ ] `db:verify` script exists and is documented.
- [ ] Docs describe: install → optional vault migration → verify; host adapters separate.

### W2 — Shared connector catalog module

**Deliverables**
- Export `franchise-mcp-store-ui/catalog` with:
  - `FranchiseProviderDescriptor`, `HostCatalogOverlay`, `projectFranchiseCatalog`
  - `FRANCHISE_PROVIDER_CATALOG` (canonical CS/Elevate id set + planned coming-soon)
- Hosts overlay `connectHref` / status / `connectable`; default demotion for non-connectable.
- Vitest: id uniqueness, setupKind enum stability, no-secret serialization, overlay demotion, snapshot of stable id list.

**Acceptance**
- [ ] Subpath export builds + types emit.
- [ ] Catalog stability tests green; id set frozen in test (explicit allow-add).
- [ ] Projection never invents connectHref from shared data.
- [ ] Documented that Elevate demote-unwired / `connectable` remains host-owned.

### W3 — CI PostgreSQL + advanced DB tests

**Deliverables**
- `.github/workflows/verify.yml`: install PostgreSQL server (e.g. `postgresql` / `postgresql-17`) before `npm run test:db`.
- Quick-win race/RLS coverage if gaps are cheap (retain existing 8-way credential + consume races; ensure verify.sql still run).

**Acceptance**
- [ ] `test:db` runs on ubuntu-24.04 Verify job with installed `initdb`/`pg_ctl`.
- [ ] Existing race/RLS/Vault-fail-closed assertions still pass.
- [ ] No weakening of Option D contract tests.

### W4 — Elevate adopt (follow-on swarm)

- Reconcile Elevate SQL to byte-identical package core + keep host adapters (blueprint preference A), or record transform provenance.
- Consume `/catalog` + keep `CONNECTABLE_PROVIDER_IDS = { google-suite }` demotion.
- Wire `host-install-migrations` / provenance check into Elevate CI.
- Pin style: unify toward release tarball or git SHA consistently.
- **Do not** auto-add connectable ids.

**Acceptance:** Elevate CI green; #41 demotion tests green; provenance hash matches package release; UI pin current.

### W5 — Release + host sync automation (follow-on)

- Tag → pack → `schema-manifest.json` → GitHub Release assets.
- Action or Dependabot/Renovate opens version-bump PRs on Elevate, CS, Stillpoint.
- Optional: stub overlay PR when new catalog ids appear (default unavailable).

**Acceptance:** Cutting a release opens (or drafts) host bump PRs; schema manifest attached.

### W6 — Coffee Story + Stillpoint adopt (follow-on)

- CS/SP consume `/catalog` (CS may keep richer local metadata layered on shared descriptors).
- Fix PKCE: cookie = binding only; verifier in Vault/secret manager (align with adoption.md / Elevate).
- Stillpoint: alias map; `setup` projection; host-exclusive connectors appended.
- SQL adopt optional/deferred per OPTIONS.md; if adopted, use W1 installer.
- demote-unwired equivalent via `canConfigure` / `authReady`.

**Acceptance:** Pin unified; PKCE contract tests fail if verifier in cookie; catalog ids overlay without forcing connect.

## 5. File touch list

### This pass (W1–W3) — `franchise-mcp-store-ui`

| Path | Change |
| --- | --- |
| `scripts/host-install-migrations.mjs` | **New** — copy SQL + provenance |
| `scripts/db-verify.mjs` | **New** — verify wrapper |
| `supabase/bootstrap/local/vault_shim.sql` | **New** — local Vault shim |
| `src/catalog.ts` | **New** — types, projection, export |
| `src/catalog-data.ts` | **New** — canonical descriptors |
| `src/catalog.test.ts` | **New** — stability / overlay tests |
| `package.json` | exports `/catalog`, scripts `db:verify` / `host:install-migrations`, `files` include bootstrap + scripts needed |
| `.github/workflows/verify.yml` | Install PostgreSQL before `test:db` |
| `docs/supabase.md` | Host install + shim + verify |
| `docs/adoption.md` | Catalog overlay contract; fix stale pins |
| `docs/prd/franchise-mcp-autonomy-plan.md` | Mirror of this plan |
| `scripts/test-package.mjs` | Assert catalog + bootstrap/sql paths packed |

### Follow-on (W4–W6) — host repos (not this agent)

| Host | Touches |
| --- | --- |
| Elevate | catalog import, demote overlay stay, SQL reconcile, pin bump, CI provenance |
| Coffee Story | catalog consume, PKCE cookie fix, pin bump |
| Stillpoint | aliases + setup projection, PKCE fix, pin bump |
| Package | `release.yml`, schema-manifest, sync-PR workflow |

## 6. Risks

| Risk | Mitigation |
| --- | --- |
| Elevate SQL already drifted (idempotent fork) | W4 reconcile to byte-identical + adapters; provenance CI fails on silent edit |
| Catalog bloat / connectHref sneak-in | Tests forbid hrefs/secrets in descriptors; projection-only connect |
| CS/SP PKCE-in-cookie | W6 explicit fix; negative tests; do not ship shared authorize routes until fixed |
| Pin skew (tarball vs git SHA) | W5 unify release artifact + sync PRs |
| Stillpoint id vocabulary | Aliases in overlay; no mass rename day-one |
| Accidental hosted vault_shim | Loud LOCAL/CI ONLY headers; docs; not in migrations/ |
| Auto-connect regression vs #41 | Overlay `connectable` required; demotion default |
| CI PG install flaky on runners | Pin apt package; fail job if `initdb` missing |

## 7. Phased rollout

| Phase | When | Scope |
| --- | --- | --- |
| **P0 — Package (this PR)** | Now | W1 host-install + vault_shim + db:verify + docs; W2 `/catalog`; W3 CI PG |
| **P1 — Elevate** | Next swarm | W4 adopt catalog + SQL provenance; keep demote-unwired |
| **P2 — Release sync** | After P1 or parallel | W5 tag/release + host bump PRs |
| **P3 — CS / Stillpoint** | After P2 | W6 catalog overlay + PKCE remediation; SQL optional |
| **P4 — Advanced hosted** | Later | Staging Vault+Auth job; provider smoke; Inspector nightly (verification.md) |

## 8. Success metrics

- Package Verify CI: `test:db` honestly green with real PG.
- Host can run one install command and get hashed, provenance-tracked migrations + local shim path.
- New provider id added only in package catalog → appears on hosts after bump as **unavailable** until certified.
- Option D + Vault contract unchanged (fail-closed without Vault; no plaintext public columns).
- Elevate `#41` demotion remains the reference overlay pattern.

---

*Plan SSOT copy also mirrored to `franchise-mcp-store-ui/docs/prd/franchise-mcp-autonomy-plan.md`.*
