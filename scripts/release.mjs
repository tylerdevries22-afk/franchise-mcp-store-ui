#!/usr/bin/env node
/**
 * Bump version, refresh CHANGELOG, pack, create GitHub Release (+ optional npm publish).
 *
 * Usage:
 *   node scripts/release.mjs --bump patch|minor|major [--dry-run] [--skip-npm] [--sync]
 *   node scripts/release.mjs --version 1.4.0 [--dry-run] [--skip-npm] [--sync]
 *
 * Primary distribution is the GitHub Release tarball (hosts already pin that URL).
 * npm publish runs only when NPM_TOKEN is set (or the environment is already logged in).
 */
import { existsSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import {
  ROOT,
  readJson,
  writeJson,
  run,
  bumpSemver,
  parseArgs,
  ensureChangelog,
  collectCommitNotes,
} from './lib/release-utils.mjs';

function usage(code = 1) {
  console.error(`Usage:
  node scripts/release.mjs --bump patch|minor|major [--dry-run] [--skip-npm] [--sync] [--skip-verify]
  node scripts/release.mjs --version X.Y.Z [--dry-run] [--skip-npm] [--sync] [--skip-verify]`);
  process.exit(code);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) usage(0);

  const pkg = readJson('package.json');
  const hosts = readJson('hosts.json');
  const repo = hosts.githubRepo || 'tylerdevries22-afk/franchise-mcp-store-ui';

  let next = args.version;
  if (!next) {
    if (!args.bump || !['patch', 'minor', 'major'].includes(args.bump)) usage(1);
    next = bumpSemver(pkg.version, args.bump);
  }
  if (!/^\d+\.\d+\.\d+$/.test(next)) {
    throw new Error(`Version must be X.Y.Z, got ${next}`);
  }
  if (next === pkg.version) {
    throw new Error(`Refusing to re-release current version ${next}`);
  }

  const tag = `v${next}`;
  const dry = Boolean(args['dry-run']);
  const skipNpm = Boolean(args['skip-npm']);
  const skipVerify = Boolean(args['skip-verify']);

  console.log(`Release plan: ${pkg.version} -> ${next} (tag ${tag})${dry ? ' [dry-run]' : ''}`);

  const lastTag = run('git', ['describe', '--tags', '--abbrev=0'], { allowFail: true }).stdout.trim();
  const notes = collectCommitNotes(lastTag || undefined);

  if (!skipVerify) {
    console.log('Running verify suite…');
    for (const script of ['lint', 'typecheck', 'test:coverage', 'test:package']) {
      run('npm', ['run', script], { stdio: 'inherit' });
    }
  }

  pkg.version = next;
  if (!dry) writeJson('package.json', pkg);
  else console.log(`[dry-run] would set package.json version=${next}`);

  if (!dry) ensureChangelog(next, notes);
  else console.log(`[dry-run] would prepend CHANGELOG for ${next}`);

  console.log('Building package tarball…');
  run('npm', ['run', 'build'], { stdio: dry ? 'pipe' : 'inherit' });
  const pack = run('npm', ['pack', '--json']);
  const packed = JSON.parse(pack.stdout);
  const tarballName = packed[0]?.filename || `franchise-mcp-store-ui-${next}.tgz`;
  const tarballPath = path.join(ROOT, tarballName);
  if (!existsSync(tarballPath)) throw new Error(`Expected tarball missing: ${tarballPath}`);
  console.log(`Packed ${tarballName}`);

  if (dry) {
    console.log('[dry-run] skip commit/tag/release/publish');
    console.log(`Tarball ready at ${tarballPath}`);
    return;
  }

  run('git', ['add', 'package.json', 'CHANGELOG.md']);
  run('git', ['commit', '-m', `chore(release): ${tag}`]);
  run('git', ['tag', '-a', tag, '-m', `Release ${tag}`]);

  // Push branch + tag (caller must be on a release branch or main with rights).
  const branch = run('git', ['rev-parse', '--abbrev-ref', 'HEAD']).stdout.trim();
  run('git', ['push', 'origin', `HEAD:${branch}`, tag], { stdio: 'inherit' });

  const body = `## franchise-mcp-store-ui ${next}

${notes}

### Install (host apps)

\`\`\`sh
npm install ${`https://github.com/${repo}/releases/download/${tag}/${tarballName}`}
\`\`\`

Or pin a full commit:

\`\`\`json
"franchise-mcp-store-ui": "github:${repo}#<full-sha>"
\`\`\`

See docs/release-and-sync.md for host sync automation.
`;

  run(
    'gh',
    [
      'release',
      'create',
      tag,
      tarballPath,
      '--title',
      `MCP Store UI ${next}`,
      '--notes',
      body,
      '--repo',
      repo,
    ],
    { stdio: 'inherit' },
  );

  let publishedNpm = false;
  if (!skipNpm && (process.env.NPM_TOKEN || process.env.NODE_AUTH_TOKEN)) {
    console.log('NPM_TOKEN present — attempting npm publish…');
    const publish = run(
      'npm',
      ['publish', tarballPath, '--access', 'public'],
      {
        allowFail: true,
        stdio: 'inherit',
        env: {
          NPM_TOKEN: process.env.NPM_TOKEN || process.env.NODE_AUTH_TOKEN,
        },
      },
    );
    publishedNpm = publish.status === 0;
    if (!publishedNpm) {
      console.warn('npm publish failed or was blocked; GitHub Release tarball remains the source of truth.');
    }
  } else {
    console.log('No NPM_TOKEN/NODE_AUTH_TOKEN — skipped npm publish (expected). Hosts use the GitHub tarball/git tag flow.');
  }

  try {
    unlinkSync(tarballPath);
  } catch {
    /* keep for debugging */
  }

  console.log(`Released ${tag}. npm published: ${publishedNpm}`);

  if (args.sync) {
    console.log('Triggering host sync…');
    run('node', ['scripts/sync-hosts.mjs', '--version', next], { stdio: 'inherit' });
  } else {
    console.log(`Next: node scripts/sync-hosts.mjs --version ${next}`);
    console.log('Or run workflow_dispatch sync-hosts.yml');
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
