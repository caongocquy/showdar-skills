import path from 'node:path';

export const NATIVE_TARGETS = ['codex', 'opencode', 'claude', 'universal'];

const ROOTS = {
  codex: ['.codex', 'skills'],
  opencode: ['.opencode', 'skills'],
  claude: ['.claude', 'skills'],
  universal: ['.agents', 'skills'],
};

export function resolveTargets(ai) {
  if (ai === 'all') return [...NATIVE_TARGETS];
  if (!NATIVE_TARGETS.includes(ai)) throw new Error(`Unknown AI target "${ai}". Expected codex, opencode, claude, universal, or all.`);
  return [ai];
}

export function skillRootFor(target, projectRoot) {
  const parts = ROOTS[target];
  if (!parts) throw new Error(`Unknown AI target "${target}".`);
  return path.join(projectRoot, ...parts);
}

export function opencodeCommandRoot(projectRoot) {
  return path.join(projectRoot, '.opencode', 'commands', 'showdar');
}
