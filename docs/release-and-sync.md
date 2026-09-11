# Release and host sync

When a new connector/version ships in `franchise-mcp-store-ui`, host apps should
move to that reviewed artifact together. This repo provides scaffolding for:

1. **Release** — version bump, changelog, `npm pack`, GitHub Release (+ optional npm publish)
2. **Sync** — open version-bump PRs in declared host repositories

Primary distribution today is the **GitHub Release tarball** (and/or a pinned
full commit). npm registry publish is optional and skipped unless `NPM_TOKEN` is
configured.

## Hosts

Canonical list: [`hosts.json`](../hosts.json)

| Host id | GitHub repo | Pin style | package.json path(s) |
| --- | --- | --- | --- |
| `elevate-web-dev-solutions` | `tylerdevries22-afk/elevate-web-dev-solutions` | `github-commit` | `artifacts/elevate-web/package.json`, `artifacts/api-server/package.json` |
| `coffee-story` | `tylerdevries22-afk/coffee-story` | `release-tarball` | `apps/hq/package.json` |
| `stillpoint-builders` | `tylerdevries22-afk/stillpoint-builders` | `release-tarball` | `package.json` |

StillPoint’s GitHub name is **`tylerdevries22-afk/stillpoint-builders`** (local
clone: `Dev/stillpoint-builders/stillpoint-builders`).

Pin examples:

```json
"franchise-mcp-store-ui": "https://github.com/tylerdevries22-afk/franchise-mcp-store-ui/releases/download/v1.3.0/franchise-mcp-store-ui-1.3.0.tgz"
```

```json
"franchise-mcp-store-ui": "github:tylerdevries22-afk/franchise-mcp-store-ui#9734ee3d75215ebbfb1fa6a005591083745edf90"
```

## Local release

Prereqs: clean git tree on `main` (or a release branch you intend to push),
`gh` authenticated with `repo` + `workflow`, Node 22+.

```sh
npm ci
# Preview
node scripts/release.mjs --bump patch --dry-run --skip-verify

# Ship (runs verify unless --skip-verify)
node scripts/release.mjs --bump patch
# or
node scripts/release.mjs --version 1.4.0 --sync
```

What it does:

1. Optionally runs lint / typecheck / coverage / package tests
2. Bumps `package.json` and prepends `CHANGELOG.md`
3. `npm pack` → creates annotated tag `vX.Y.Z` → pushes branch + tag
4. `gh release create` uploading `franchise-mcp-store-ui-X.Y.Z.tgz`
5. `npm publish` **only** if `NPM_TOKEN` or `NODE_AUTH_TOKEN` is set
6. With `--sync`, runs `scripts/sync-hosts.mjs`

If npm publish is blocked or unset, hosts keep using the tarball/git tag flow
above — that is the supported path today.

## Local host sync

```sh
# After v1.4.0 exists on GitHub Releases
node scripts/sync-hosts.mjs --version 1.4.0 --dry-run
node scripts/sync-hosts.mjs --version 1.4.0
node scripts/sync-hosts.mjs --version 1.4.0 --host coffee-story
```

The script clones each host shallowly with `gh`, rewrites declared dependency
entries, attempts `--package-lock-only` refresh when a lockfile path is listed,
pushes `chore/bump-franchise-mcp-store-ui-X.Y.Z`, and opens a PR.

## GitHub Actions

| Workflow | Trigger | Purpose |
| --- | --- | --- |
| [`.github/workflows/release.yml`](../.github/workflows/release.yml) | `workflow_dispatch` | Bump + changelog + GitHub Release; optional host sync |
| [`.github/workflows/sync-hosts.yml`](../.github/workflows/sync-hosts.yml) | `workflow_dispatch` | Open host bump PRs for an already-released version |

### Secrets

| Secret | Required for | Notes |
| --- | --- | --- |
| `HOST_SYNC_TOKEN` | Cross-repo sync PRs (and preferred for Release when `sync_hosts` is true) | Classic PAT or fine-grained token with **contents: write** + **pull requests: write** on `elevate-web-dev-solutions`, `coffee-story`, and `stillpoint-builders`. Same-owner `GITHUB_TOKEN` cannot open PRs in other repos. |
| `NPM_TOKEN` | Optional `npm publish` | Automation token for https://www.npmjs.com. Leave unset to ship GitHub-only. |
| `GITHUB_TOKEN` | Release tag + assets in this repo | Provided by Actions; enough for GitHub Release without cross-repo sync. |

Set secrets under **Settings → Secrets and variables → Actions** on
`tylerdevries22-afk/franchise-mcp-store-ui`.

### Dispatch examples

Release a patch and open host PRs:

1. Actions → **Release** → Run workflow
2. bump=`patch`, sync_hosts=`true`

Bump hosts only (tag already exists):

1. Actions → **Sync hosts** → Run workflow
2. version=`1.4.0`

## Coordination notes

- Another agent may touch CI/scripts; rebase this branch before merge and avoid
  editing catalog/connector content in the same PR as release scaffolding.
- Do not force-push `main`. Release commits are ordinary commits on `main`.
- Host PRs are intentionally separate so each app’s CI and product review can gate
  adoption of the new connector package.

## Adding a host

1. Add an entry to `hosts.json` with `repo`, `defaultBranch`, and each
   `dependencies[].packageJson` + `style` (`release-tarball` | `github-commit` | `github-tag`).
2. Optionally set `lockfile` for lock refresh attempts.
3. Ensure `HOST_SYNC_TOKEN` can write to that repository.
4. Dry-run: `node scripts/sync-hosts.mjs --version <current> --host <id> --dry-run`
