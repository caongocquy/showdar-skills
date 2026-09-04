export const SKILLS = [
  { id: 'showdar-understand', domain: 'understand', description: 'Use when mapping an unfamiliar repository, architecture, dependencies, or impact before deciding what to change.' },
  { id: 'showdar-plan', domain: 'plan', description: 'Use when agreed behavior needs a bounded implementation plan, change surface, task order, risks, or verification steps.' },
  { id: 'showdar-design', domain: 'design', description: 'Use when product UI needs design direction, UX decisions, responsive layout, accessibility, or visual polish.' },
  { id: 'showdar-build', domain: 'build', description: 'Use when implementing or refactoring an agreed application change within existing architecture and contracts.' },
  { id: 'showdar-debug', domain: 'debug', description: 'Use when observed behavior fails through crashes, regressions, build failures, races, networking, memory, or performance issues.' },
  { id: 'showdar-test', domain: 'test', description: 'Use when choosing or implementing automated tests for behavior, regressions, integration, E2E, or coverage.' },
  { id: 'showdar-review', domain: 'review', description: 'Use when reviewing code or diffs for general correctness, architecture, performance, maintainability, or tests.' },
  { id: 'showdar-upgrade', domain: 'upgrade', description: 'Use when upgrading dependencies, frameworks, runtimes, or native platforms and compatibility or rollback risk matters.' },
  { id: 'showdar-ship', domain: 'ship', description: 'Use when checking whether a change, artifact, or release is ready for handoff or external release.' },
  { id: 'showdar-recover', domain: 'recover', description: 'Use when interrupted or partial engineering work must be reconstructed from repository evidence before continuing.' },
  { id: 'showdar-git', domain: 'git', description: 'Use when performing local Git inspection, staging, commits, branch integration, conflicts, cleanup, or explicitly requested remote Git actions.' },
  { id: 'showdar-requirements', domain: 'requirements', description: 'Use when product or business input needs explicit behavior, rules, acceptance criteria, assumptions, or open decisions.' },
  { id: 'showdar-quality', domain: 'quality', description: 'Use when planning QA/QC scenarios, risk coverage, regression scope, compatibility checks, or bug-report evidence.' },
  { id: 'showdar-security', domain: 'security', description: 'Use when assessing threat models, attack surfaces, trust boundaries, auth/authz, secrets, exposure, or exploitability.' },
  { id: 'showdar-ops', domain: 'ops', description: 'Use when inspecting or changing CI/CD, containers, environments, deployment, observability, rollback, or runtime operations.' },
];

export const AI_TARGETS = ['codex', 'opencode', 'claude', 'universal', 'all'];

const ids = (...values) => values;

export const PROFILES = {
  minimal: ids('showdar-understand', 'showdar-plan', 'showdar-build', 'showdar-debug', 'showdar-test', 'showdar-review', 'showdar-recover', 'showdar-git'),
  developer: ids('showdar-understand', 'showdar-plan', 'showdar-design', 'showdar-build', 'showdar-debug', 'showdar-test', 'showdar-review', 'showdar-upgrade', 'showdar-ship', 'showdar-recover', 'showdar-git', 'showdar-security'),
  backend: ids('showdar-understand', 'showdar-plan', 'showdar-build', 'showdar-debug', 'showdar-test', 'showdar-review', 'showdar-upgrade', 'showdar-ship', 'showdar-recover', 'showdar-git', 'showdar-requirements', 'showdar-quality', 'showdar-security', 'showdar-ops'),
  qa: ids('showdar-understand', 'showdar-requirements', 'showdar-quality', 'showdar-test', 'showdar-debug', 'showdar-review', 'showdar-ship', 'showdar-recover', 'showdar-git'),
  product: ids('showdar-understand', 'showdar-requirements', 'showdar-plan', 'showdar-design', 'showdar-quality', 'showdar-review'),
  full: SKILLS.map((skill) => skill.id),
};

export const PROFILE_ALIASES = {
  mobile: 'developer',
  web: 'developer',
};

function profileName(profile) {
  return PROFILE_ALIASES[profile] ?? profile;
}

export function canonicalProfile(profile) {
  const canonical = profileName(profile);
  if (!PROFILES[canonical]) throw new Error(`Unknown profile "${profile}". Expected one of: ${[...Object.keys(PROFILES), ...Object.keys(PROFILE_ALIASES)].join(', ')}`);
  return canonical;
}

export function isDeprecatedProfile(profile) {
  return Object.hasOwn(PROFILE_ALIASES, profile);
}

export function resolveProfile(profile) {
  return [...PROFILES[canonicalProfile(profile)]];
}

export function getSkill(id) {
  return SKILLS.find((skill) => skill.id === id) ?? null;
}
