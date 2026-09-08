import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const root = process.cwd();
const consumer = mkdtempSync(join(tmpdir(), 'mcp-store-consumer-'));
const run = (command, args, cwd = root) => execFileSync(command, args,
  { cwd, encoding: 'utf8', timeout: 60_000, stdio: ['pipe', 'pipe', 'pipe'] });
const packed = JSON.parse(run('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', consumer]))[0];
assert.ok(packed.files.some((file) => file.path === 'dist/oauth.d.ts'));
assert.ok(packed.files.some((file) => file.path === 'supabase/migrations/202609080001_mcp_store.sql'));
assert.ok(packed.files.every((file) => !/\.test\.|^src\/|^work\/|(^|\/)\.env/.test(file.path)));
assert.ok(readFileSync('dist/index.js', 'utf8').startsWith("'use client'"));
writeFileSync(join(consumer, 'package.json'), JSON.stringify({ name: 'mcp-store-consumer-proof', version: '1.0.0', private: true, type: 'module' }));
const react = JSON.parse(readFileSync('node_modules/react/package.json', 'utf8')).version;
const reactTypes = JSON.parse(readFileSync('node_modules/@types/react/package.json', 'utf8')).version;
const domTypes = JSON.parse(readFileSync('node_modules/@types/react-dom/package.json', 'utf8')).version;
// A real install in a separate consumer; lifecycle scripts are disabled.
run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--fetch-retries=1', '--fetch-timeout=15000',
  join(consumer, packed.filename), `react@${react}`, `react-dom@${react}`,
  `@types/react@${reactTypes}`, `@types/react-dom@${domTypes}`], consumer);
writeFileSync(join(consumer, 'server.mjs'), `
import assert from 'node:assert/strict';
import {createMcpOAuthMaterial,verifyMcpOAuthState} from 'franchise-mcp-store-ui/oauth';
const key='test-only-configuration-with-more-than-32-characters';
const m=createMcpOAuthMaterial('slack',key);
assert.equal(verifyMcpOAuthState(m.state,'slack',key).provider,'slack');
`);
run(process.execPath, ['server.mjs'], consumer);
writeFileSync(join(consumer, 'browser.tsx'), `
import React from 'react';
import {McpStore, type McpStoreEntry} from 'franchise-mcp-store-ui';
const entries: McpStoreEntry[]=[];
export const app=<McpStore entries={entries}/>;
`);
const options = { entryPoints: [join(consumer, 'browser.tsx')], bundle: true,
  write: false, outdir: join(consumer, 'bundle'), logLevel: 'silent' };
const browser = await build({ ...options, platform: 'browser', metafile: true });
assert.ok(browser.outputFiles.some((file) => file.path.endsWith('.css')));
assert.ok(!JSON.stringify(browser.metafile).includes('node:crypto'));
writeFileSync(join(consumer, 'unsafe.ts'), "import 'franchise-mcp-store-ui/oauth';");
await assert.rejects(build({ ...options, platform: 'browser', entryPoints: [join(consumer, 'unsafe.ts')] }),
  /Could not resolve/, 'Node OAuth export must fail closed in a browser build');
writeFileSync(join(consumer, 'ssr.tsx'), `
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {McpStore} from 'franchise-mcp-store-ui';
if(!renderToStaticMarkup(<McpStore entries={[]}/>).includes('Connectors')) throw new Error('SSR failed');
`);
await build({ ...options, entryPoints: [join(consumer, 'ssr.tsx')], platform: 'node', format: 'esm',
  external: ['react', 'react-dom/server'], outdir: undefined, outfile: join(consumer, 'ssr.mjs'), write: true });
run(process.execPath, ['ssr.mjs'], consumer);
run(process.execPath, [join(root, 'node_modules/typescript/bin/tsc'), '--noEmit', '--strict',
  '--jsx', 'react-jsx', '--module', 'NodeNext', '--moduleResolution', 'NodeNext', '--target', 'ES2022',
  'browser.tsx'], consumer);
console.log('PASS: packed files, clean npm install, Node OAuth, browser JS+CSS, browser OAuth rejection, React SSR, consumer TypeScript.');
console.log(`Packed consumer retained at ${consumer}`);
