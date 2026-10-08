import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

function git(cwd, args, optional = false) {
  try {
    return execFileSync('git', ['--no-optional-locks', ...args], {
      cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 10000,
    }).trim();
  } catch (error) {
    if (optional && error.status === 1) return null;
    throw new Error(`Git inspection failed (${args[0]}): ${error.stderr?.toString().trim() || error.message}`);
  }
}

/**
 * Read-only agent preflight. This reports whether a local-write task has
 * branch isolation; it cannot intercept file writes made by other tools.
 */
export function guardMutation({ cwd, mutation }) {
  if (!['read-only', 'local-write'].includes(mutation)) {
    throw new Error('guard --mutation must be read-only or local-write.');
  }
  if (mutation === 'read-only') {
    return { allowed: true, code: 'read-only', mutation, currentBranch: null, integrationBranch: null, directWork: false };
  }

  const root = git(cwd, ['rev-parse', '--show-toplevel']);
  const currentBranch = git(root, ['symbolic-ref', '--quiet', '--short', 'HEAD'], true);
  const config = key => git(root, ['config', '--local', '--get', key], true);
  const directWork = config('showdar.gitDirectWork');
  if (directWork !== null && !['true', 'false'].includes(directWork)) {
    throw new Error('showdar.gitDirectWork must be true or false.');
  }
  const configuredBase = config('showdar.gitBase');
  const defaultRef = git(root, ['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD'], true)?.replace(/^origin\//, '') ?? null;
  const integrationNames = new Set(['develop', 'development', 'dev', 'main', 'master', configuredBase, defaultRef].filter(Boolean));
  const context = {
    mutation, currentBranch, integrationBranch: configuredBase ?? defaultRef,
    directWork: directWork === 'true',
  };

  for (const marker of ['MERGE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD', 'rebase-merge', 'rebase-apply', 'BISECT_LOG', 'sequencer']) {
    const location = git(root, ['rev-parse', '--git-path', marker]);
    if (existsSync(path.resolve(root, location))) {
      return { allowed: false, code: 'git-operation-active', ...context };
    }
  }
  if (!currentBranch) return { allowed: false, code: 'detached-head', ...context };

  const isIntegration = integrationNames.has(currentBranch);
  const allowed = !isIntegration || directWork === 'true';
  const code = !allowed ? 'task-branch-required'
    : isIntegration ? 'direct-work-configured' : 'task-branch-ready';
  return { allowed, code, ...context };
}

export function formatMutationGuard(data) {
  return `${data.allowed ? 'ALLOWED' : 'BLOCKED'}: ${data.code}
Mutation: ${data.mutation}
Branch: ${data.currentBranch ?? '(detached or not inspected)'}${data.allowed ? '' : '\nPrepare a safe task branch with showdar git-start, then rerun guard. Do not write source while blocked.'}`;
}
