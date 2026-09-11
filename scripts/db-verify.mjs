#!/usr/bin/env node
/**
 * Run supabase/verify.sql against a local/operator Postgres connection.
 * Requires psql. Never accepts silent remote defaults — DATABASE_URL or
 * --database-url must be provided explicitly.
 *
 *   DATABASE_URL=postgres://… npm run db:verify
 *   npm run db:verify -- --database-url postgres://…
 */
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(__dirname, '..');
const verifySql = join(packageRoot, 'supabase/verify.sql');

function usage(code = 1) {
  console.error(`Usage: DATABASE_URL=<url> npm run db:verify
   or: npm run db:verify -- --database-url <url>
Reads supabase/verify.sql (grant/RLS/oauth diagnostics). Operator connection only.`);
  process.exit(code);
}

const argv = process.argv.slice(2);
let databaseUrl = process.env.DATABASE_URL ?? process.env.MCP_STORE_DATABASE_URL ?? null;
for (let i = 0; i < argv.length; i += 1) {
  if (argv[i] === '--help' || argv[i] === '-h') usage(0);
  if (argv[i] === '--database-url') { databaseUrl = argv[++i]; continue; }
  console.error(`Unknown argument: ${argv[i]}`);
  usage(1);
}

if (!databaseUrl) {
  console.error('Missing DATABASE_URL (or --database-url). Refusing to guess a database.');
  usage(1);
}
if (!existsSync(verifySql)) {
  console.error(`Missing ${verifySql}`);
  process.exit(1);
}

const result = spawnSync('psql', [databaseUrl, '-v', 'ON_ERROR_STOP=1', '-f', verifySql], {
  stdio: 'inherit',
  env: process.env,
});
if (result.error) {
  console.error(`Failed to spawn psql: ${result.error.message}`);
  process.exit(1);
}
process.exit(result.status ?? 1);
