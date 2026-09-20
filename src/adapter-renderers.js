import { ALL_SKILLS } from './catalog.js';

const CANONICAL_ROUTE_ORDER = [
  ['map repository architecture, dependencies, or impact', 'showdar-understand'],
  ['plan implementation of agreed behavior and scope', 'showdar-plan'],
  ['design product UI, UX, responsive layout, accessibility, or visual polish', 'showdar-design'],
  ['implement or refactor an agreed application change', 'showdar-build'],
  ['debug an observed bug, crash, regression, build, or performance failure', 'showdar-debug'],
  ['choose or implement automated tests and coverage', 'showdar-test'],
  ['review code or diffs for general correctness, architecture, performance, maintainability, or tests', 'showdar-review'],
  ['upgrade dependencies, frameworks, runtimes, or platforms', 'showdar-upgrade'],
  ['check release, artifact, or handoff readiness', 'showdar-ship'],
  ['recover interrupted or partial engineering work', 'showdar-recover'],
  ['perform local Git inspection, staging, commit, merge, rebase, or conflict work', 'showdar-git'],
  ['define product behavior, business rules, ambiguity, or acceptance criteria', 'showdar-requirements'],
  ['plan QA scenarios, risk coverage, regression, compatibility, or bug evidence', 'showdar-quality'],
  ['assess threats, attack surface, trust boundaries, auth, secrets, exposure, or exploitability', 'showdar-security'],
  ['inspect or change CI/CD, containers, environments, deployment, observability, rollback, or runtime operations', 'showdar-ops'],
  ['implement a complete feature end-to-end across multiple lifecycle stages', 'showdar-feature'],
  ['resolve an observed defect end-to-end', 'showdar-bugfix'],
  ['prepare, validate, or execute a release lifecycle', 'showdar-release'],
  ['investigate or recover from an active operational incident', 'showdar-incident'],
];

function getSkillDescription(skillId) {
  const skill = ALL_SKILLS.find((s) => s.id === skillId);
  return skill?.description ?? '';
}

export function renderShowdarInstruction(skillIds) {
  const wanted = new Set(skillIds);
  const routes = CANONICAL_ROUTE_ORDER
    .filter(([, id]) => wanted.has(id))
    .map(([intent, id]) => `- ${intent} -> \`${id}\``);
  for (const id of [...wanted].sort()) {
    if (!CANONICAL_ROUTE_ORDER.some(([, known]) => known === id)) {
      routes.push(`- ${getSkillDescription(id)} -> \`${id}\``);
    }
  }
  return `${routes.join('\n')}\n`;
}

export function renderShowdarCommand(skillId) {
  const description = getSkillDescription(skillId);
  return `---
description: ${description}
---

Load and follow \`${skillId}\`.
Ground in the current repository.
Request: \$ARGUMENTS
`;
}

export function renderShowdarAggregator(skillIds) {
  const sorted = [...new Set(skillIds)].sort((a, b) => a.localeCompare(b));
  const ids = sorted.join(', ');
  return `---
description: Invoke a specific Showdar flagship skill explicitly
---
Select exactly one requested Showdar skill and follow it: ${ids}. Whole-task intent (complete feature, end-to-end fix, release lifecycle, active incident) selects a workflow; single primitive intent stays primitive. If the requested name is ambiguous, choose the smallest matching skill from this list and say which one was selected.

Request: \$ARGUMENTS
`;
}

export function renderCursorRuleBody(skillIds) {
  const body = renderShowdarInstruction(skillIds).trimEnd();
  return `---
description: Showdar skill and workflow routing guidance for software-engineering tasks
alwaysApply: false
---

${body}
`;
}

export function renderManagedBlock(skillIds, kind) {
  const body = renderShowdarInstruction(skillIds).trimEnd();
  if (kind === 'block') {
    const START = '<!-- showdar-skills:start -->';
    const END = '<!-- showdar-skills:end -->';
    return `${START}\n## Showdar Skills routing\n\nUse the smallest Showdar skill that fully matches the current task. Do not load unrelated Showdar skills.\n\n${body}\n\nFor debugging, gather evidence before modifying code. For shipping or destructive operations, require explicit user approval and fresh verification. Never print or commit secrets.\n${END}\n`;
  } else if (kind === 'file') {
    return renderCursorRuleBody(skillIds);
  }
  return body;
}
