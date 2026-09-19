export const SKILLS = [
  { id: 'showdar-understand', kind: 'primitive', domain: 'understand', description: 'Use when mapping an unfamiliar repository, architecture, dependencies, or impact before deciding what to change.' },
  { id: 'showdar-plan', kind: 'primitive', domain: 'plan', description: 'Use when agreed behavior needs a bounded implementation plan, change surface, task order, risks, or verification steps.' },
  { id: 'showdar-design', kind: 'primitive', domain: 'design', description: 'Use when product UI needs design direction, UX decisions, responsive layout, accessibility, or visual polish.' },
  { id: 'showdar-build', kind: 'primitive', domain: 'build', description: 'Use when implementing or refactoring an agreed application change within existing architecture and contracts.' },
  { id: 'showdar-debug', kind: 'primitive', domain: 'debug', description: 'Use when observed behavior fails through crashes, regressions, build failures, races, networking, memory, or performance issues.' },
  { id: 'showdar-test', kind: 'primitive', domain: 'test', description: 'Use when choosing or implementing automated tests for behavior, regressions, integration, E2E, or coverage.' },
  { id: 'showdar-review', kind: 'primitive', domain: 'review', description: 'Use when reviewing code or diffs for general correctness, architecture, performance, maintainability, or tests.' },
  { id: 'showdar-upgrade', kind: 'primitive', domain: 'upgrade', description: 'Use when upgrading dependencies, frameworks, runtimes, or native platforms and compatibility or rollback risk matters.' },
  { id: 'showdar-ship', kind: 'primitive', domain: 'ship', description: 'Use when checking whether a change, artifact, or release is ready for handoff or external release.' },
  { id: 'showdar-recover', kind: 'primitive', domain: 'recover', description: 'Use when interrupted or partial engineering work must be reconstructed from repository evidence before continuing.' },
  { id: 'showdar-git', kind: 'primitive', domain: 'git', description: 'Use when performing local Git inspection, staging, commits, branch integration, conflicts, cleanup, or explicitly requested remote Git actions.' },
  { id: 'showdar-requirements', kind: 'primitive', domain: 'requirements', description: 'Use when product or business input needs explicit behavior, rules, acceptance criteria, assumptions, or open decisions.' },
  { id: 'showdar-quality', kind: 'primitive', domain: 'quality', description: 'Use when planning QA/QC scenarios, risk coverage, regression scope, compatibility checks, or bug-report evidence.' },
  { id: 'showdar-security', kind: 'primitive', domain: 'security', description: 'Use when assessing threat models, attack surfaces, trust boundaries, auth/authz, secrets, exposure, or exploitability.' },
  { id: 'showdar-ops', kind: 'primitive', domain: 'ops', description: 'Use when inspecting or changing CI/CD, containers, environments, deployment, observability, rollback, or runtime operations.' },
];

export const WORKFLOW_SKILLS = [
  { id: 'showdar-feature', kind: 'workflow', domain: 'feature', stages: ['showdar-understand', 'showdar-requirements', 'showdar-plan', 'showdar-design', 'showdar-build', 'showdar-test', 'showdar-review'], description: 'Use when implementing a complete feature end-to-end, adaptively sequencing understand, requirements, plan, design, build, test, and review stages based on existing definition.' },
  { id: 'showdar-bugfix', kind: 'workflow', domain: 'bugfix', stages: ['showdar-understand', 'showdar-debug', 'showdar-build', 'showdar-test', 'showdar-review'], description: 'Use when resolving an observed defect end-to-end, adaptively sequencing understand, debug, build, test, and review stages based on whether root cause is already proven.' },
  { id: 'showdar-release', kind: 'workflow', domain: 'release', stages: ['showdar-quality', 'showdar-security', 'showdar-ship', 'showdar-ops'], description: 'Use when preparing, validating, or executing a release lifecycle, adaptively sequencing quality, security, ship, and ops stages with strict authority boundaries.' },
  { id: 'showdar-incident', kind: 'workflow', domain: 'incident', stages: ['showdar-understand', 'showdar-debug', 'showdar-recover', 'showdar-test', 'showdar-ops'], description: 'Use when investigating and recovering from an active operational incident, adaptively sequencing understand, debug, recover, verification, and ops stages with strict mutation authority.' },
];

export const PRIMITIVE_SKILLS = SKILLS;

export const ALL_SKILLS = [...SKILLS, ...WORKFLOW_SKILLS];

export const PRIMITIVE_COUNT = SKILLS.length;

export const WORKFLOW_COUNT = WORKFLOW_SKILLS.length;

export const TOTAL_COUNT = ALL_SKILLS.length;

export const AI_TARGETS = ['codex', 'opencode', 'cursor', 'claude', 'universal', 'all'];

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
  return ALL_SKILLS.find((skill) => skill.id === id) ?? null;
}

export function getPrimitive(id) {
  return SKILLS.find((skill) => skill.id === id) ?? null;
}

export function getWorkflow(id) {
  return WORKFLOW_SKILLS.find((skill) => skill.id === id) ?? null;
}

export function isWorkflowSkill(id) {
  return WORKFLOW_SKILLS.some((skill) => skill.id === id);
}

export function normalizeSkillName(name) {
  if (typeof name !== 'string' || !name.trim()) throw new Error('Skill name is required.');
  const trimmed = name.trim();
  const canonical = trimmed.startsWith('showdar-') ? trimmed : `showdar-${trimmed}`;
  const skill = getSkill(canonical);
  if (!skill) {
    const known = ALL_SKILLS.map((s) => s.id.replace(/^showdar-/, '')).join(', ');
    throw new Error(`Unknown skill "${name}". Available skills: ${known}`);
  }
  return skill.id;
}

