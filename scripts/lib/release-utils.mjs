import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export function readJson(rel) {
  return JSON.parse(readFileSync(path.join(ROOT, rel), 'utf8'));
}

export function writeJson(rel, data) {
  writeFileSync(path.join(ROOT, rel), `${JSON.stringify(data, null, 2)}\n`);
}

export function run(cmd, args, opts = {}) {
  const result = spawnSync(cmd, args, {
    cwd: opts.cwd ?? ROOT,
    encoding: 'utf8',
    stdio: opts.stdio ?? 'pipe',
    env: { ...process.env, ...opts.env },
  });
  if (result.status !== 0 && !opts.allowFail) {
    const detail = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
    throw new Error(`${cmd} ${args.join(' ')} failed (${result.status})${detail ? `:\n${detail}` : ''}`);
  }
  return result;
}

export function bumpSemver(version, bump) {
  const m = /^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(version);
  if (!m) throw new Error(`Unsupported version: ${version}`);
  let [major, minor, patch] = m.slice(1).map(Number);
  if (bump === 'major') {
    major += 1;
    minor = 0;
    patch = 0;
  } else if (bump === 'minor') {
    minor += 1;
    patch = 0;
  } else if (bump === 'patch') {
    patch += 1;
  } else {
    throw new Error(`Unknown bump: ${bump}`);
  }
  return `${major}.${minor}.${patch}`;
}

export function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith('--')) {
        out[key] = true;
      } else {
        out[key] = next;
        i += 1;
      }
    } else {
      out._.push(a);
    }
  }
  return out;
}

export function tarballUrl(repo, version) {
  const name = `franchise-mcp-store-ui-${version}.tgz`;
  return `https://github.com/${repo}/releases/download/v${version}/${name}`;
}

export function githubDep(repo, sha) {
  return `github:${repo}#${sha}`;
}

export function resolveTagSha(repo, version) {
  const tag = `v${version}`;
  const result = run('gh', ['api', `repos/${repo}/git/ref/tags/${tag}`, '--jq', '.object.sha'], {
    allowFail: true,
  });
  if (result.status !== 0) {
    // Annotated tags point at a tag object; peel to commit.
    const peeled = run(
      'gh',
      ['api', `repos/${repo}/git/ref/tags/${tag}`, '--jq', '.object'],
      { allowFail: true },
    );
    throw new Error(`Could not resolve tag ${tag} on ${repo}: ${result.stderr || peeled.stderr}`);
  }
  let sha = result.stdout.trim();
  const typeResult = run('gh', ['api', `repos/${repo}/git/ref/tags/${tag}`, '--jq', '.object.type'], {
    allowFail: true,
  });
  if (typeResult.stdout.trim() === 'tag') {
    const commit = run('gh', ['api', `repos/${repo}/git/tags/${sha}`, '--jq', '.object.sha']);
    sha = commit.stdout.trim();
  }
  return sha;
}

export function ensureChangelog(version, notes) {
  const rel = 'CHANGELOG.md';
  const file = path.join(ROOT, rel);
  const today = new Date().toISOString().slice(0, 10);
  const entry = `## [${version}] - ${today}\n\n${notes.trim()}\n\n`;
  let current = '';
  try {
    current = readFileSync(file, 'utf8');
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      writeFileSync(file, `# Changelog\n\n${entry}`);
      return;
    }
    throw err;
  }
  if (current.includes(`## [${version}]`)) return;
  const marker = '# Changelog';
  if (current.startsWith(marker)) {
    const rest = current.slice(marker.length).replace(/^\s*\n/, '\n');
    writeFileSync(file, `${marker}\n\n${entry}${rest.replace(/^\n/, '')}`);
  } else {
    writeFileSync(file, `${entry}${current}`);
  }
}

export function collectCommitNotes(sinceRef) {
  const range = sinceRef ? `${sinceRef}..HEAD` : 'HEAD';
  const result = run('git', ['log', '--pretty=format:- %s (%h)', range], { allowFail: true });
  const lines = (result.stdout || '').trim();
  if (!lines) {
    return '### Changed\n\n- Release scaffolding / packaging update.\n';
  }
  return `### Changed\n\n${lines}\n`;
}
