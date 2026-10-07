import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

export const TASK_BRANCH_TYPES = ['feature', 'fix', 'refactor', 'test', 'docs', 'chore', 'release', 'hotfix'];

function git(cwd, args, optional = false) {
  try { return execFileSync('git', ['--no-optional-locks', ...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 10000 }).trim(); }
  catch (error) {
    if (optional && error.status === 1) return null;
    throw new Error(`Git operation failed (${args[0]}): ${error.stderr?.toString().trim() || error.message}`);
  }
}

export function taskSlug(name, type) {
  if (typeof name !== 'string' || !name.trim()) throw new Error('--name requires a task name.');
  const words = name.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').split('-');
  // Drop a redundant task verb, including one following a useful ticket key.
  const offset = /^[a-z]+$/.test(words[0]) && /^\d+$/.test(words[1] ?? '') ? 2 : 0;
  if ([type, 'add'].includes(words[offset])) words.splice(offset, 1);
  const slug = words.join('-').slice(0, 80).replace(/-+$/g, '');
  if (!slug) throw new Error('Task name contains no safe branch characters.');
  return slug;
}

function inspect({ cwd, type, name, base }) {
  if (!TASK_BRANCH_TYPES.includes(type)) throw new Error(`Invalid task type. Expected ${TASK_BRANCH_TYPES.join(', ')}.`);
  const root = git(cwd, ['rev-parse', '--show-toplevel']);
  const current = git(root, ['symbolic-ref', '--quiet', '--short', 'HEAD'], true);
  if (!current) throw new Error('Detached HEAD: choose a repository branch before git-start.');
  const head = git(root, ['rev-parse', 'HEAD']);
  const dirty = git(root, ['status', '--porcelain=v1', '--untracked-files=all']);
  for (const marker of ['MERGE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD', 'rebase-merge', 'rebase-apply', 'BISECT_LOG', 'sequencer']) {
    const file = git(root, ['rev-parse', '--git-path', marker]);
    if (existsSync(path.resolve(root, file))) throw new Error(`Active Git operation: ${marker}.`);
  }
  const config = key => git(root, ['config', '--local', '--get', key], true);
  const prefix = config('showdar.gitBranchPrefix') ?? type;
  const branch = `${prefix}/${taskSlug(name, type)}`;
  git(root, ['check-ref-format', '--branch', branch]);
  if (branch.startsWith('-')) throw new Error('Invalid task branch.');
  const configuredBase = config('showdar.gitBase');
  const defaultRef = git(root, ['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD'], true)?.replace(/^origin\//, '');
  const localBranch = value => value && !value.startsWith('-') && git(root, ['show-ref', '--verify', '--quiet', `refs/heads/${value}`], true) !== null;
  if (base && !localBranch(base)) throw new Error('Explicit --base must be an existing local branch.');
  if (configuredBase && !localBranch(configuredBase)) throw new Error('Configured showdar.gitBase must be an existing local branch.');
  if (type === 'hotfix' && !base && !configuredBase) throw new Error('Hotfix requires --base or repository showdar.gitBase convention.');
  const resolvedBase = base ?? configuredBase ?? ['develop', 'development', 'dev', defaultRef, 'main', 'master'].find(localBranch);
  if (!resolvedBase) throw new Error('Cannot infer integration base; use --base with the repository convention.');
  const baseHead = git(root, ['rev-parse', `refs/heads/${resolvedBase}`]);
  const integration = new Set(['develop', 'development', 'dev', 'main', 'master', defaultRef, resolvedBase]);
  let action;
  if (current === branch) action = 'continue';
  else {
    if (dirty) throw new Error('Dirty worktree ownership is ambiguous. Preserve changes; git-start never stashes or carries unproven task changes.');
    if (!integration.has(current)) throw new Error('Already on another task branch; continue that coherent task or select its integration branch explicitly.');
    const direct = config('showdar.gitDirectWork');
    if (direct !== null && !['true', 'false'].includes(direct)) throw new Error('showdar.gitDirectWork must be true or false.');
    if (direct === 'true') action = 'direct';
    else if (localBranch(branch)) {
      const targetHead = git(root, ['rev-parse', `refs/heads/${branch}`]);
      // Equal tips are the only automatically provable safe unused branch.
      if (targetHead !== head || targetHead !== baseHead) throw new Error('Existing task branch collision: history/ownership is ambiguous.');
      action = 'switch';
    } else {
      if (baseHead !== head && git(root, ['merge-base', '--is-ancestor', head, baseHead], true) === null) throw new Error('Current branch diverges from base; inspect repository history before branching.');
      action = 'create';
    }
  }
  return { root, current, head, base: resolvedBase, baseHead, branch, action, dirty: dirty ? 'present' : 'clean' };
}

export function startTaskBranch(options) {
  const proposal = inspect(options);
  if (options.dryRun || ['continue', 'direct'].includes(proposal.action)) return { ...proposal, dryRun: Boolean(options.dryRun) };
  const fresh = inspect(options);
  if (JSON.stringify(fresh) !== JSON.stringify(proposal)) throw new Error('Git state changed during preflight; retry after inspection.');
  if (fresh.action === 'create') git(fresh.root, ['switch', '-c', fresh.branch, fresh.baseHead]);
  else git(fresh.root, ['switch', fresh.branch]);
  const current = git(fresh.root, ['branch', '--show-current']);
  if (current !== fresh.branch) throw new Error('Task branch switch was not confirmed.');
  return { ...fresh, dryRun: false, current };
}

export function formatGitStart(data) {
  return `Task branch: ${data.branch}\nBase: ${data.base}\nAction: ${data.action}${data.dryRun ? ' (dry-run)' : ''}\nWorktree: ${data.dirty}\nBranch preparation does not authorize source edits, commit, merge or push.`;
}
