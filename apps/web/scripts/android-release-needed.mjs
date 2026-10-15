import { execFileSync } from 'node:child_process';
import { appendFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const tauriPath = 'apps/web/tauri';
// The app compiles the client cache crates natively; the team bumps this
// package's version when a cache change must ship, so a bump counts as a
// native change (other edits under crates/client do not).
const cacheWasmManifest = 'crates/client/cache-wasm/Cargo.toml';
const releaseTag = /^v20\d{2}\.\d{1,2}\.\d{1,2}(?:\.\d{1,2})?$/;

export function androidReleaseDecision({ releases, cwd = process.cwd() }) {
  const git = (...args) =>
    execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    }).trim();
  const head = git('rev-parse', '--verify', 'HEAD^{commit}');
  const tree = git('rev-parse', '--verify', `${head}:${tauriPath}`);
  const cacheWasmVersion = (commit) => {
    try {
      return (
        git('show', `${commit}:${cacheWasmManifest}`).match(
          /^version\s*=\s*"([^"]*)"/m
        )?.[1] ?? 'none'
      );
    } catch {
      return 'none'; // the package did not exist at this commit
    }
  };
  const candidates = new Map();
  for (const release of releases) {
    const tag = release.tag_name;
    if (release.draft || release.prerelease || !releaseTag.test(tag)) continue;
    const stem = `macro-${tag}-android-arm64`;
    const assets = new Set(
      release.assets
        .filter((asset) => asset.state === 'uploaded' && asset.size > 0)
        .map((asset) => asset.name)
    );
    if (
      !['.aab', '.aab.sha256', '-mapping.txt', '-mapping.txt.sha256'].every(
        (suffix) => assets.has(`${stem}${suffix}`)
      )
    )
      continue;
    // Missing tags/history must fail, rather than silently reuse a version code.
    const commit = git('rev-parse', '--verify', `refs/tags/${tag}^{commit}`);
    candidates.set(commit, tag);
  }

  // API release ordering can differ from commit order. Only consider ancestors
  // of this release, and prefer the closest one in topological history order.
  const baseline = git('rev-list', '--topo-order', head)
    .split('\n')
    .find((commit) => candidates.has(commit));
  if (!baseline) {
    return {
      build: true,
      summary:
        'Build the first AAB: no ancestor release has complete Android artifacts.',
    };
  }
  const tag = candidates.get(baseline);
  const tauriChanged =
    tree !== git('rev-parse', '--verify', `${baseline}:${tauriPath}`);
  const cacheBumped = cacheWasmVersion(head) !== cacheWasmVersion(baseline);
  if (!tauriChanged && !cacheBumped) {
    return {
      build: false,
      summary: `Skip Android: ${tauriPath}/ and the client cache wasm version are unchanged since ${tag}. App updates use the bundle updater.`,
    };
  }
  // The version code bump itself lives under the Tauri directory, so name
  // the cache bump too when that is what the release is really for.
  const reason = [
    tauriChanged && `${tauriPath}/ changed since ${tag}`,
    cacheBumped &&
      `the client cache wasm version moved since ${tag} (${cacheWasmVersion(baseline)} → ${cacheWasmVersion(head)})`,
  ]
    .filter(Boolean)
    .join(' and ');

  const versionCode = (commit) => {
    const config = JSON.parse(
      git('show', `${commit}:${tauriPath}/src-tauri/tauri.android.conf.json`)
    );
    const code = config.bundle?.android?.versionCode;
    if (!Number.isInteger(code) || code < 1 || code > 2_100_000_000)
      throw new Error(`Invalid Android versionCode at ${commit}`);
    return code;
  };
  if (versionCode(head) <= versionCode(baseline)) {
    throw new Error(
      `Native code changed (${reason}), but Android versionCode did not increase. Run just android-bump in apps/web and commit before tagging.`
    );
  }
  return {
    build: true,
    summary: `Build Android: ${reason}.`,
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    const repository = process.env.GITHUB_REPOSITORY;
    if (!repository || !/^[\w.-]+\/[\w.-]+$/.test(repository))
      throw new Error('GITHUB_REPOSITORY must identify the release repository');
    const pages = JSON.parse(
      execFileSync(
        'gh',
        [
          'api',
          '--paginate',
          '--slurp',
          `repos/${repository}/releases?per_page=100`,
        ],
        { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
      )
    );
    const decision = androidReleaseDecision({ releases: pages.flat() });
    console.log(decision.summary);
    if (process.env.GITHUB_OUTPUT)
      await appendFile(process.env.GITHUB_OUTPUT, `build=${decision.build}\n`);
    if (process.env.GITHUB_STEP_SUMMARY)
      await appendFile(
        process.env.GITHUB_STEP_SUMMARY,
        `${decision.summary}\n`
      );
  } catch (error) {
    console.error(
      error instanceof Error
        ? error.message
        : 'Android release detection failed'
    );
    process.exitCode = 1;
  }
}
