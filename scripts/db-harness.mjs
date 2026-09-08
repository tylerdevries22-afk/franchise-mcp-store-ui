import { execFileSync, execFile } from 'node:child_process';
import { mkdtempSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const asyncExec = promisify(execFile);

/** Never accepts a database URL: this harness owns an isolated local cluster. */
export function startDatabase() {
  const root = mkdtempSync(join(tmpdir(), 'mcp-store-db-'));
  const socket = join(root, 'socket');
  mkdirSync(socket, { mode: 0o700 });
  const bin = process.env.MCP_STORE_PG_BIN ?? (existsSync('/opt/homebrew/opt/postgresql@17/bin/initdb')
    ? '/opt/homebrew/opt/postgresql@17/bin' : execFileSync('pg_config', ['--bindir'], { encoding: 'utf8' }).trim());
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('PG')));
  const options = { env, encoding: 'utf8', timeout: 30_000, maxBuffer: 4_000_000, stdio: ['pipe', 'pipe', 'pipe'] };
  const run = (tool, args, extra = {}) => execFileSync(join(bin, tool), args, { ...options, ...extra });
  run('initdb', ['-D', join(root, 'data'), '--username=postgres', '--auth-local=trust', '--auth-host=reject', '--no-locale']);
  // Private Unix socket only; no network listener and no contact with existing DBs.
  run('pg_ctl', ['-D', join(root, 'data'), '-l', join(root, 'postgres.log'), '-o',
    `-k ${socket} -c listen_addresses='' -c plpgsql.check_asserts=on`, '-w', 'start']);
  const args = ['-X', '-h', socket, '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'];
  return {
    root,
    sql: (input) => run('psql', [...args, '-At'], { input }),
    file: (path) => run('psql', [...args, '-f', path]),
    concurrent: (input) => asyncExec(join(bin, 'psql'), [...args, '-At', '-c', input], options).then((r) => r.stdout.trim()),
    restore: () => {
      const dump = run('pg_dump', ['-h', socket, '-U', 'postgres', '-d', 'postgres']);
      run('createdb', ['-h', socket, '-U', 'postgres', 'restored']);
      run('psql', [...args, '-d', 'restored'], { input: dump });
      return (input) => run('psql', [...args, '-d', 'restored', '-At'], { input });
    },
    stop: () => run('pg_ctl', ['-D', join(root, 'data'), '-m', 'fast', '-w', 'stop']),
  };
}
