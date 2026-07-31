// §D6/§D5 — the ONLY path this capability may use to commit files via `commitStateAndMerge`,
// plus the local (pre-commit) state persistence every card-scoped action needs.
// `github.ts`'s D6 sonar waiver assumes its diff is docs-only BY CONSTRUCTION (it only ever
// commits campaign state files) — so this module must never be able to hand it a code file.
// `StateCommitFiles` (kernel: `core/types.ts`) has exactly two named, single-purpose fields
// (never a bare `string[]` the rest of this module could smuggle an arbitrary path into),
// and `toCommitFileList` additionally asserts every path ends in `.json`/`.md` at runtime.
// `commitState` is the ONLY call site of `commitStateAndMerge` in this module — there is no
// second path in.
import { join } from 'node:path';
import type { CampaignState, ResolvedConfig, StateCommitFiles } from '../types.ts';
import { serializeState } from '../state.ts';
import { commitStateAndMerge } from '../github.ts';
import type { CommitStateAndMergeResult, GithubConfig, GithubIO } from '../github.ts';
import type { LoopIO } from '../../ports/ports.ts';

export const ALLOWED_COMMIT_EXTENSIONS = ['.json', '.md'];

export function assertStateOrEscalationPath(path: string): void {
  if (!ALLOWED_COMMIT_EXTENSIONS.some((ext) => path.endsWith(ext))) {
    throw new Error(
      `refusing to commit "${path}" via commitStateAndMerge: only campaign state (.json) and ` +
        `escalation (.md) files may ever be committed this way — commitStateAndMerge's D6 ` +
        `sonar waiver assumes a docs-only diff by construction, and a code file would break that.`,
    );
  }
}

export function toCommitFileList(files: StateCommitFiles): string[] {
  assertStateOrEscalationPath(files.statePath);
  const list = [files.statePath];
  if (files.escalationPath) {
    assertStateOrEscalationPath(files.escalationPath);
    list.push(files.escalationPath);
  }
  return list;
}

/** The ONLY call site of `commitStateAndMerge` in this module. */
export async function commitState(
  files: StateCommitFiles,
  title: string,
  config: GithubConfig,
  io: GithubIO,
): Promise<CommitStateAndMergeResult> {
  return commitStateAndMerge(toCommitFileList(files), title, config, io);
}

export function buildStatePrBody(cardId: string): string {
  return (
    `Automated campaign-state update for ${cardId} by the tribe campaign runner ` +
    '(docs-only: campaign state + escalation files, never code).'
  );
}

export function githubConfigFor(resolved: ResolvedConfig, cardId: string): GithubConfig {
  return {
    repoRoot: resolved.repoRoot,
    card: cardId,
    prBody: buildStatePrBody(cardId),
    baseBranch: resolved.baseBranch,
    remote: resolved.remote,
  };
}

export function persistLocalState(state: CampaignState, resolved: ResolvedConfig, io: LoopIO): void {
  io.writeFile(join(resolved.repoRoot, resolved.statePath), serializeState(state));
}
