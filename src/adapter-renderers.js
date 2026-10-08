import { ALL_SKILLS } from './catalog.js';

const RUNTIME_GUIDANCE = `Automatic Showdar selection: route the current request through \`showdar route --stdin --json\` when the Showdar CLI is available. Supply the prompt as literal stdin data, never as interpolated shell syntax. Honor the canonical lifecycle primary; do not substitute another installed skill when it is missing. Report missing skills and suggest \`showdar add <name>\`; never auto-install. Include installed domain matches only as specialized context overlays; load returned advisors only when installed. Domain discovery does not grant authority or replace the lifecycle route.
Explicit named-skill requests may load that installed skill directly without automatic routing. Workflow skills remain native discoverable choices; the router does not select workflows. If the CLI is unavailable, use native skill discovery/static descriptions below. Do not fetch a CLI through npx or install dependencies automatically.
Routing does not authorize mutation. Inspect the returned mutation class and current task authority before work. For local-write tasks, before the first task-owned source edit inspect Git state. On develop, development, dev, main, master or the repository default/integration branch, DO NOT begin source edits yet: prepare one branch per coherent task first. Follow repository instructions/documented convention, explicit current user instruction, clearly detected convention, then the Showdar safe default. Explicit trunk/direct-work policy wins.
Before ANY task-owned source/config/test/docs write, execute Git preflight even if the router selected build directly. On integration/default branches inspect repository policy and EXECUTE \`showdar git-start --type <type> --name <task>\` (not just --dry-run), or equivalent repository-safe branch preparation. Then EXECUTE \`showdar guard --mutation local-write --json\` and require ok=true AND data.allowed=true BEFORE invoking any file-writing tool. If blocked, STOP before editing. On a matching task branch run guard without creating a new branch. Recheck before each later mutating stage. Do not infer permission from \`showdar route\`. If the CLI is unavailable, manually inspect Git and confirm the appropriate task branch or documented direct-work policy; never silently write on develop/main. Dirty ownership/branch collisions require inspection; never infer stash/reset/restore/clean. Guard and git-start do not authorize source edits, commit, merge or push. Completion means verify and report.
Shared project context: before project work, read the relevant existing files under docs/agents/ (project.md, issue-tracker.md, verification.md, domain.md) when present. These are project-specific conventions, not mutation authority. Use the canonical glossary and ADRs when present; do not invent them. If project setup has not run, proceed using normal repository evidence and suggest showdar setup only when useful.`;

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
  return `${routes.join('\n')}\n\n${RUNTIME_GUIDANCE}\n`;
}

export function renderShowdarCommand(skillId) {
  const description = getSkillDescription(skillId);
  return `---
description: ${description}
---

Load and follow \`${skillId}\`.
Ground in the current repository.
${RUNTIME_GUIDANCE}
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

${RUNTIME_GUIDANCE}

Request: \$ARGUMENTS
`;
}

export function renderCursorRuleBody(skillIds) {
  const body = renderShowdarInstruction(skillIds).trimEnd();
  return `---
description: Showdar skill and workflow routing guidance for software-engineering tasks
alwaysApply: true
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

export function renderShowdarSetupCommand() {
  return [
    '---',
    'description: Guide Showdar installation and repository onboarding with existing CLI commands',
    '---',
    '',
    'You are the Showdar onboarding guide. Use existing CLI capabilities, not a new setup engine or intent router.',
    'First inspect the repository and existing Showdar installation (showdar status, and relevant project conventions).',
    'If the required skills are absent or the user wants to change the selection, explain wizard vs init/add. Recommend showdar wizard for interactive selection. Do not silently install, replace, or remove skills. Ask for approval before any installer write.',
    'If skills are already installed and sufficient, skip wizard. Do not reinstall merely because this command was invoked.',
    'For project context, run showdar setup --dry-run --json and show the detected Git host, stack, scripts, existing documents, and exact proposed file actions.',
    'Ask only about ambiguous or missing decisions. Do not invent architectural, domain, tracker, or verification conventions.',
    'Before any local write (including installer/setup configuration changes), inspect Git state and project branch policy; use showdar git-start when on an integration branch and allowed, then require showdar guard --mutation local-write --json with ok=true and data.allowed=true.',
    'Only after explicit approval apply the selected installation step (if needed) and run showdar setup --yes with confirmed --tracker and --docs-dir. Avoid unnecessary interactive commands in non-TTY environments.',
    'Do not overwrite user-owned files. The setup CLI only creates missing context documents. Never edit source code, create remote issues, commit, merge, or push as part of onboarding.',
    'Run showdar doctor, report the installed skills, context documents, verification results, unresolved warnings, and a short example of how to request a task.',
    '',
    'Request: $ARGUMENTS',
    '',
  ].join('\\n');
}
