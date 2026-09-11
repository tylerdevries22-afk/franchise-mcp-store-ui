# Changelog

## [1.3.1] - 2026-09-11

### Changed

- feat: MCP franchise autonomy W1–W3 (host install, catalog, CI Postgres) (#11) (146042a)
- Merge pull request #10 from tylerdevries22-afk/chore/release-sync-automation (72012c8)
- fix: avoid TOCTOU patterns flagged by CodeQL in release scripts (5e7d7a8)
- docs: refresh host pin + PKCE consumer matrix (e942db5)
- chore: add release and cross-repo host sync scaffolding (6aaab53)
- fix: portable React return types for CI prepare (#9) (9734ee3)
- Merge pull request #1 from tylerdevries22-afk/audit/mcp-store-20260907 (d8d9fed)

All notable releases of `franchise-mcp-store-ui` are recorded here.
Host apps consume a reviewed GitHub Release tarball or a pinned full commit SHA
(see [docs/release-and-sync.md](docs/release-and-sync.md)).

## [1.3.0] - 2026-09-08

### Added
- Shared searchable MCP connector store UI with setup guidance disclosures.
- Node-only `/oauth` helpers (signed state, PKCE, nonce, browser binding).
- Optional Supabase SQL contract and verification docs.

### Notes
- Hosts should pin `v1.3.0` tarball or the reviewed commit that produced it.
- npm registry publish is optional; primary distribution is GitHub Releases.
