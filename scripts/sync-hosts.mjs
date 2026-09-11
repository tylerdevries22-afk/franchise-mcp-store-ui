#!/usr/bin/env node
/**
 * Open version-bump PRs in host repos listed by hosts.json.
 *
 * Usage:
 *   node scripts/sync-hosts.mjs --version 1.4.0 [--host elevate-web-dev-solutions] [--dry-run]
 *   node scripts/sync-hosts.mjs --version 1.4.0 --sha <full-sha>   # override commit pin
 *
 * Requires `gh` auth with write access to each host repo.
 * In GitHub Actions, set secret HOST_SYNC_TOKEN (PAT with repo scope across hosts).
 */
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  readJson,
  run,
  parseArgs,
  tarballUrl,
  githubDep,
  resolveTagSha,
} from './lib/release-utils.mjs';

function usage(code = 1) {
  console.error(`Usage:
  node scripts/sync-hosts.mjs --version X.Y.Z [--host <id>] [--sha <full-sha>] [--dry-run] [--no-lockfile]`);
  process.exit(code);
}

function replaceDependency(pkgJsonText, packageName, nextValue) {
  const pkg = JSON.parse(pkgJsonText);
  let found = false;
  for (const section of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
    if (pkg[section] && Object.prototype.hasOwnProperty.call(pkg[section], packageName)) {
      pkg[section][packageName] = nextValue;
      found = true;
    }
  }
  if (!found) {
    throw new Error(`Package ${packageName} not found in ${Object.keys(pkg.dependencies || {})}`);
  }
  return `${JSON.stringify(pkg, null, 2)}\n`;
}

function depValueFor(style, repo, version, sha) {
  if (style === 'release-tarball') return tarballUrl(repo, version);
  if (style === 'github-commit') return githubDep(repo, sha);
  if (style === 'github-tag') return githubDep(repo, `v${version}`);
  throw new Error(`Unknown dependency style: ${style}`);
}

async function syncHost(host, ctx) {
  const { packageName, githubRepo, version, sha, dry, refreshLockfile } = ctx;
  const branch = `chore/bump-${packageName}-${version}`;
  const title = `chore(deps): bump ${packageName} to ${version}`;
  const body = `## Summary
- Bump \`${packageName}\` to **${version}** across declared package.json paths.
- Source of truth release: https://github.com/${githubRepo}/releases/tag/v${version}
- Commit pin (for github-commit style): \`${sha}\`

## Test plan
- [ ] Host install / lockfile resolves
- [ ] Typecheck + relevant UI smoke for MCP store
- [ ] Confirm no unrelated catalog/CI churn

Automated by \`scripts/sync-hosts.mjs\` from \`${githubRepo}\`.
`;

  console.log(`\n==> ${host.id} (${host.repo})`);

  if (dry) {
    for (const dep of host.dependencies) {
      const value = depValueFor(dep.style, githubRepo, version, sha);
      console.log(`[dry-run] ${dep.packageJson}: ${packageName} -> ${value}`);
    }
    console.log(`[dry-run] would open PR on ${host.repo} branch ${branch}`);
    return { host: host.id, status: 'dry-run' };
  }

  const work = mkdtempSync(path.join(tmpdir(), `mcp-sync-${host.id}-`));
  try {
    run('gh', ['repo', 'clone', host.repo, work, '--', '--depth', '1', '--branch', host.defaultBranch || 'main'], {
      stdio: 'inherit',
    });

    const changed = [];
    for (const dep of host.dependencies) {
      const abs = path.join(work, dep.packageJson);
      let before;
      try {
        before = readFileSync(abs, 'utf8');
      } catch (err) {
        if (err && err.code === 'ENOENT') throw new Error(`Missing ${dep.packageJson} in ${host.repo}`);
        throw err;
      }
      const value = depValueFor(dep.style, githubRepo, version, sha);
      const after = replaceDependency(before, packageName, value);
      if (before === after) {
        console.log(`unchanged ${dep.packageJson}`);
        continue;
      }
      writeFileSync(abs, after);
      changed.push(dep.packageJson);

      if (refreshLockfile && dep.lockfile) {
        const pkgDir = path.dirname(abs);
        console.log(`Refreshing lockfile via npm install in ${path.dirname(dep.packageJson)}…`);
        const install = run(
          'npm',
          ['install', `${packageName}@${value}`, '--package-lock-only', '--ignore-scripts', '--no-audit', '--no-fund'],
          { cwd: pkgDir, allowFail: true, stdio: 'inherit' },
        );
        if (install.status === 0) changed.push(dep.lockfile);
        else console.warn(`Lockfile refresh failed for ${dep.packageJson}; PR will include package.json only.`);
      }
    }

    if (changed.length === 0) {
      console.log('No file changes — already at target version.');
      return { host: host.id, status: 'noop' };
    }

    run('git', ['checkout', '-b', branch], { cwd: work });
    run('git', ['add', ...changed], { cwd: work });
    run('git', ['-c', 'user.email=41898282+github-actions[bot]@users.noreply.github.com', '-c', 'user.name=github-actions[bot]', 'commit', '-m', title], {
      cwd: work,
    });
    run('git', ['push', '-u', 'origin', branch], { cwd: work, stdio: 'inherit' });

    const pr = run(
      'gh',
      ['pr', 'create', '--repo', host.repo, '--base', host.defaultBranch || 'main', '--head', branch, '--title', title, '--body', body],
      { cwd: work },
    );
    const url = pr.stdout.trim();
    console.log(`Opened ${url}`);
    return { host: host.id, status: 'opened', url };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.version) usage(args.help ? 0 : 1);
  if (!/^\d+\.\d+\.\d+$/.test(args.version)) throw new Error('version must be X.Y.Z');

  const manifest = readJson('hosts.json');
  const packageName = manifest.packageName;
  const githubRepo = manifest.githubRepo;
  const version = args.version;
  const dry = Boolean(args['dry-run']);
  const refreshLockfile = !args['no-lockfile'];

  let sha = args.sha;
  if (!sha) {
    try {
      sha = resolveTagSha(githubRepo, version);
    } catch (err) {
      if (dry) {
        sha = '0'.repeat(40);
        console.warn(`[dry-run] tag v${version} not resolvable yet; using placeholder sha`);
      } else {
        throw err;
      }
    }
  }

  const hosts = manifest.hosts.filter((h) => !args.host || h.id === args.host);
  if (hosts.length === 0) throw new Error(`No hosts matched filter ${args.host}`);

  console.log(`Syncing ${packageName}@${version} (sha ${sha}) to ${hosts.length} host(s)`);

  const results = [];
  for (const host of hosts) {
    results.push(await syncHost(host, { packageName, githubRepo, version, sha, dry, refreshLockfile }));
  }

  console.log('\nSummary:');
  for (const r of results) {
    console.log(`- ${r.host}: ${r.status}${r.url ? ` ${r.url}` : ''}`);
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
