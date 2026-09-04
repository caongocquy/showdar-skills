export const SKILLS = [
  { id: 'showdar-understand', domain: 'understand', description: 'Build a reliable mental model of an unfamiliar repository before making changes.' },
  { id: 'showdar-plan', domain: 'plan', description: 'Turn requirements into bounded, executable implementation plans with explicit risks and verification.' },
  { id: 'showdar-design', domain: 'design', description: 'Design, implement, review, and polish product UI with searchable design knowledge and stack guidance.' },
  { id: 'showdar-build', domain: 'build', description: 'Implement the smallest coherent change that fits existing architecture, contracts, and failure handling.' },
  { id: 'showdar-debug', domain: 'debug', description: 'Find root causes with evidence-first experiments before applying minimal, regression-proven fixes.' },
  { id: 'showdar-test', domain: 'test', description: 'Choose and implement the right unit, integration, end-to-end, and regression coverage for a change.' },
  { id: 'showdar-review', domain: 'review', description: 'Perform high-signal code review focused on correctness, security, architecture, performance, and tests.' },
  { id: 'showdar-upgrade', domain: 'upgrade', description: 'Upgrade dependencies, frameworks, and platforms safely with compatibility analysis and rollback planning.' },
  { id: 'showdar-ship', domain: 'ship', description: 'Verify delivery readiness and platform-specific release checks; explicit release execution is opt-in.' },
  { id: 'showdar-recover', domain: 'recover', description: 'Reconstruct interrupted work from repository evidence and choose the safest next action without guessing.' },
];

export const AI_TARGETS = ['codex', 'opencode', 'claude', 'universal', 'all'];

const ids = (...values) => values;

export const PROFILES = {
  minimal: ids('showdar-understand', 'showdar-plan', 'showdar-build', 'showdar-debug', 'showdar-test', 'showdar-review', 'showdar-recover'),
  web: ids('showdar-understand', 'showdar-plan', 'showdar-design', 'showdar-build', 'showdar-debug', 'showdar-test', 'showdar-review', 'showdar-upgrade', 'showdar-ship', 'showdar-recover'),
  backend: ids('showdar-understand', 'showdar-plan', 'showdar-build', 'showdar-debug', 'showdar-test', 'showdar-review', 'showdar-upgrade', 'showdar-ship', 'showdar-recover'),
  mobile: ids('showdar-understand', 'showdar-plan', 'showdar-design', 'showdar-build', 'showdar-debug', 'showdar-test', 'showdar-review', 'showdar-upgrade', 'showdar-ship', 'showdar-recover'),
  full: SKILLS.map((skill) => skill.id),
};

export function resolveProfile(profile) {
  const resolved = PROFILES[profile];
  if (!resolved) throw new Error(`Unknown profile "${profile}". Expected one of: ${Object.keys(PROFILES).join(', ')}`);
  return [...resolved];
}

export function getSkill(id) {
  return SKILLS.find((skill) => skill.id === id) ?? null;
}
