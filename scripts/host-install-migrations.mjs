#!/usr/bin/env node
/**
 * Copy franchise MCP Store SQL into a host migrations directory with a hash
 * provenance manifest. Copies are byte-identical to packaged SQL (timestamp/
 * filename only change). Host adapters stay in separate host-owned files.
 *
 * Usage:
 *   node scripts/host-install-migrations.mjs \
 *     --host-migrations ./supabase/migrations \
 *     [--include-vault] \
 *     [--prefix-timestamp 20260912120000] \
 *     [--write-provenance .mcp-store-provenance.json] \
 *     [--force]
 */
import { createHash } from 'node:crypto';
import {
  mkdirSync, readFileSync, writeFileSync, readdirSync, openSync, closeSync, writeSync,
} from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(__dirname, '..');
const require = createRequire(import.meta.url);
const pkg = require(join(packageRoot, 'package.json'));

function usage(code = 1) {
  console.error(`Usage: node scripts/host-install-migrations.mjs --host-migrations <dir> [options]
  --host-migrations <dir>   Target host migrations directory (required)
  --include-vault           Also copy supabase/optional/vault.sql
  --prefix-timestamp <ts>   14-digit timestamp prefix (default: now UTC YYYYMMDDhhmmss)
  --write-provenance <path> Provenance JSON path (default: <host-migrations>/../.mcp-store-provenance.json)
  --force                   Rewrite an existing identical-hash install in place (no duplicate)
  --dry-run                 Print actions without writing`);
  process.exit(code);
}

function parseArgs(argv) {
  const out = {
    hostMigrations: null,
    includeVault: false,
    prefixTimestamp: null,
    provenancePath: null,
    force: false,
    dryRun: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') usage(0);
    if (arg === '--include-vault') { out.includeVault = true; continue; }
    if (arg === '--force') { out.force = true; continue; }
    if (arg === '--dry-run') { out.dryRun = true; continue; }
    if (arg === '--host-migrations') { out.hostMigrations = argv[++i]; continue; }
    if (arg === '--prefix-timestamp') { out.prefixTimestamp = argv[++i]; continue; }
    if (arg === '--write-provenance') { out.provenancePath = argv[++i]; continue; }
    console.error(`Unknown argument: ${arg}`);
    usage(1);
  }
  if (!out.hostMigrations) usage(1);
  return out;
}

function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

function utcTimestamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`;
}

function resolvePath(p) {
  return isAbsolute(p) ? p : resolve(process.cwd(), p);
}

function listExisting(dir) {
  try {
    return readdirSync(dir).filter((name) => name.endsWith('.sql'));
  } catch (error) {
    if (error && error.code === 'ENOENT') return [];
    throw error;
  }
}

function findByHash(dir, hash) {
  const matches = [];
  for (const name of listExisting(dir)) {
    const full = join(dir, name);
    if (sha256(readFileSync(full)) === hash) matches.push(name);
  }
  return matches;
}

function nextName(dir, prefix, suffix, offset = 0) {
  let n = BigInt(prefix) + BigInt(offset);
  for (;;) {
    const name = `${n.toString().padStart(14, '0')}_${suffix}`;
    const existing = new Set(listExisting(dir));
    if (!existing.has(name)) return name;
    n += 1n;
  }
}

/** Create a new file exclusively, or truncate an existing path when replacing. */
function writeBytes(path, bytes, { replace }) {
  if (replace) {
    writeFileSync(path, bytes);
    return;
  }
  let fd;
  try {
    fd = openSync(path, 'wx', 0o644);
    writeSync(fd, bytes);
  } catch (error) {
    if (error && error.code === 'EEXIST') {
      throw new Error(`Refusing to overwrite existing ${path}; pass --force or choose another --prefix-timestamp`);
    }
    throw error;
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

const args = parseArgs(process.argv.slice(2));
const hostDir = resolvePath(args.hostMigrations);
const prefix = args.prefixTimestamp ?? utcTimestamp();
if (!/^\d{14}$/.test(prefix)) {
  console.error('--prefix-timestamp must be 14 digits (YYYYMMDDhhmmss)');
  process.exit(1);
}

const sources = [
  {
    key: 'core',
    sourceRel: 'supabase/migrations/202609080001_mcp_store.sql',
    suffix: 'mcp_store.sql',
    offset: 0,
  },
];
if (args.includeVault) {
  sources.push({
    key: 'vault',
    sourceRel: 'supabase/optional/vault.sql',
    suffix: 'mcp_store_vault.sql',
    offset: 1,
  });
}

const installed = [];
if (!args.dryRun) mkdirSync(hostDir, { recursive: true });

for (const item of sources) {
  const sourcePath = join(packageRoot, item.sourceRel);
  let bytes;
  try {
    bytes = readFileSync(sourcePath);
  } catch {
    console.error(`Missing packaged SQL: ${item.sourceRel}`);
    process.exit(1);
  }
  const hash = sha256(bytes);
  const existing = findByHash(hostDir, hash);
  if (existing.length > 0 && !args.force) {
    console.log(`SKIP ${item.key}: identical content already at ${existing.join(', ')} (sha256 ${hash.slice(0, 12)}…)`);
    installed.push({
      key: item.key,
      source: item.sourceRel,
      target: existing[0],
      sha256: hash,
      bytes: bytes.length,
      skipped: true,
    });
    continue;
  }
  const replace = args.force && existing.length > 0;
  const targetName = replace ? existing[0] : nextName(hostDir, prefix, item.suffix, item.offset);
  const targetPath = join(hostDir, targetName);
  if (!args.dryRun) writeBytes(targetPath, bytes, { replace });
  console.log(`${args.dryRun ? 'DRY ' : ''}${replace ? 'REPLACE' : 'WRITE'} ${targetName} <- ${item.sourceRel} (sha256 ${hash.slice(0, 12)}…)`);
  installed.push({
    key: item.key,
    source: item.sourceRel,
    target: targetName,
    sha256: hash,
    bytes: bytes.length,
    skipped: false,
    replaced: replace,
  });
}

const provenance = {
  package: pkg.name,
  version: pkg.version,
  installedAt: new Date().toISOString(),
  packageRootHint: 'node_modules/franchise-mcp-store-ui',
  notes: [
    'Copied SQL is byte-identical to the package. Do not edit applied versions.',
    'Host adapters (role grants, location bridges) must be separate forward migrations.',
    'Local vault_shim lives at supabase/bootstrap/local/vault_shim.sql — never on hosted Supabase.',
  ],
  files: installed,
  verify: 'supabase/verify.sql',
  vaultShim: 'supabase/bootstrap/local/vault_shim.sql',
};

const provenancePath = resolvePath(
  args.provenancePath
    ?? join(hostDir, '..', '.mcp-store-provenance.json'),
);
if (!args.dryRun) {
  mkdirSync(dirname(provenancePath), { recursive: true });
  writeFileSync(provenancePath, `${JSON.stringify(provenance, null, 2)}\n`);
}
console.log(`${args.dryRun ? 'DRY ' : ''}PROVENANCE ${provenancePath}`);
console.log('Next: apply host migration runner, optionally enable Vault then apply vault migration, run npm run db:verify (or psql -f node_modules/franchise-mcp-store-ui/supabase/verify.sql).');
