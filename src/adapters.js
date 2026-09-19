import path from 'node:path';
import { homedir } from 'node:os';

export const NATIVE_TARGETS = ['codex', 'opencode', 'cursor', 'claude', 'universal'];

const ROOTS = {
  codex: ['.agents', 'skills'],
  opencode: ['.opencode', 'skills'],
  cursor: ['.cursor', 'skills'],
  claude: ['.claude', 'skills'],
  universal: ['.agents', 'skills'],
};

const GLOBAL_ROOTS = {
  codex: ({ homeRoot }) => path.join(homeRoot, '.agents', 'skills'),
  opencode: ({ homeRoot }) => path.join(homeRoot, '.config', 'opencode', 'skills'),
  cursor: ({ homeRoot }) => path.join(homeRoot, '.cursor', 'skills'),
  claude: ({ homeRoot }) => path.join(homeRoot, '.claude', 'skills'),
  universal: ({ homeRoot }) => path.join(homeRoot, '.agents', 'skills'),
};

export function resolveTargets(ai) {
  if (ai === 'all') return [...NATIVE_TARGETS];
  if (!NATIVE_TARGETS.includes(ai)) throw new Error(`Unknown AI target "${ai}". Expected codex, opencode, cursor, claude, universal, or all.`);
  return [ai];
}

export function skillRootFor(target, projectRoot) {
  const parts = ROOTS[target];
  if (!parts) throw new Error(`Unknown AI target "${target}".`);
  return path.join(projectRoot, ...parts);
}

export function globalSkillRootFor(target, { homeRoot = homedir() } = {}) {
  const resolve = GLOBAL_ROOTS[target];
  if (!resolve) throw new Error(`Unknown AI target "${target}".`);
  return resolve({ homeRoot });
}

export function resolveSkillRoot({ ai, scope, cwd, home = homedir() }) {
  if (!NATIVE_TARGETS.includes(ai)) throw new Error(`Unknown AI target "${ai}".`);
  if (scope !== 'project' && scope !== 'global') throw new Error(`Unknown scope "${scope}". Expected project or global.`);
  if (scope === 'project') return skillRootFor(ai, cwd);
  return globalSkillRootFor(ai, { homeRoot: home });
}

export const COMPATIBILITY_MATRIX = {
  codex: { projectNative: true, globalNative: true },
  opencode: { projectNative: true, globalNative: true },
  cursor: { projectNative: true, globalNative: true },
  claude: { projectNative: true, globalNative: true },
  universal: { project: true, global: true },
};

export function opencodeCommandRoot(projectRoot) {
  return path.join(projectRoot, '.opencode', 'commands', 'showdar');
}

export function globalCommandRootFor({ homeRoot = homedir() } = {}) {
  return path.join(homeRoot, '.config', 'opencode', 'commands', 'showdar');
}