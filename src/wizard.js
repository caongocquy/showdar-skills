import { stdin, stdout } from 'node:process';
import { PROFILES, ALL_SKILLS, resolveProfile, normalizeSkillName, getWorkflow } from './catalog.js';
import { NATIVE_TARGETS } from './adapters.js';
import { addSkills, initGlobal, initProject } from './project.js';

const split = value => typeof value === 'string' ? value.split(',').map(x => x.trim()).filter(Boolean) : [];
function ensureChoice(value, choices, label) {
  if (!choices.includes(value)) throw new Error('Unknown ' + label + ': ' + value + '. Expected ' + choices.join(', '));
  return value;
}
export function buildWizardPlan({
  mode = 'add', profile = null, skills = '', workflows = '', ai = 'universal', scope = 'project',
} = {}) {
  ensureChoice(mode, ['add', 'replace'], 'mode');
  ensureChoice(ai, [...NATIVE_TARGETS, 'all'], 'AI target');
  ensureChoice(scope, ['project', 'global'], 'scope');
  const selected = profile ? resolveProfile(profile) : [];
  const workflowsFound = [];
  for (const name of split(workflows)) {
    const wf = getWorkflow(name.startsWith('showdar-') ? name : 'showdar-' + name);
    if (!wf) throw new Error('Unknown built-in workflow ' + name);
    workflowsFound.push(wf.id);
    selected.push(wf.id, ...wf.stages);
  }
  selected.push(...split(skills).map(normalizeSkillName));
  const all = [...new Set(selected)];
  if (!all.length) throw new Error('Choose at least one skill, profile, or workflow.');
  return { schemaVersion: 1, mode, profile, scope, ai, skills: all,
    workflows: workflowsFound, action: mode === 'add' ? 'union' : 'replace' };
}
export async function applyWizardPlan({ cwd, home, packageRoot, packageVersion, plan }) {
  if (plan?.schemaVersion !== 1 || !['add', 'replace'].includes(plan.mode)) {
    throw new Error('Invalid wizard plan.');
  }
  const safe = buildWizardPlan({ mode: plan.mode, profile: null,
    skills: plan.skills.join(','), ai: plan.ai, scope: plan.scope });
  if (safe.skills.length !== plan.skills.length) throw new Error('Invalid wizard plan members.');
  if (plan.mode === 'add') {
    return addSkills({ cwd, home, packageRoot, packageVersion,
      skills: safe.skills, ai: safe.ai, scope: safe.scope });
  }
  const profile = plan.profile || 'custom';
  return safe.scope === 'global'
    ? initGlobal({ homeRoot: home, packageRoot, packageVersion, profile,
      ai: safe.ai, skillIds: safe.skills })
    : initProject({ projectRoot: cwd, homeRoot: home, packageRoot, packageVersion,
      profile, ai: safe.ai, skillIds: safe.skills });
}

/**
 * Real keyboard-driven installer. The prompt layer is injectable for
 * cancellation and selection tests; --yes/--dry-run bypass it entirely.
 */
export async function collectWizardAnswers(defaults = {}, promptApi = null) {
  if ((!stdin.isTTY || !stdout.isTTY) && !promptApi) {
    throw new Error('Interactive wizard requires a TTY. Use --profile/--skills/--workflow with --yes or --dry-run in CI.');
  }
  const p = promptApi ?? await import('@clack/prompts');
  const { select, multiselect, confirm, intro, outro, note, cancel, isCancel } = p;
  const searchableMulti = p.autocompleteMultiselect ?? multiselect;
  const className = 'Showdar Skills · Installation';
  intro(className);

  const stop = () => {
    cancel('Installation cancelled. No files changed.');
    return { plan: null, cancelled: true };
  };
  const choose = async (options) => {
    const answer = await select(options);
    if (isCancel(answer)) return null;
    return answer;
  };
  const list = async (options, searchable = false) => {
    const answer = await (searchable ? searchableMulti(options) : multiselect(options));
    if (isCancel(answer)) return null;
    return answer;
  };
  const mode = await choose({
    message: 'Installation mode',
    initialValue: defaults.mode ?? 'add',
    options: [
      { value: 'add', label: 'Add to existing skills', hint: 'Recommended · keep installed skills' },
      { value: 'replace', label: 'Replace Showdar-managed skills', hint: 'Changes the entire managed set' },
    ],
  });
  if (mode === null) return stop();

  const ai = await choose({
    message: 'Coding agent',
    initialValue: defaults.ai ?? 'universal',
    options: [
      { value: 'universal', label: 'Universal / Codex-compatible' },
      { value: 'codex', label: 'Codex' },
      { value: 'opencode', label: 'OpenCode' },
      { value: 'cursor', label: 'Cursor' },
      { value: 'claude', label: 'Claude Code' },
      { value: 'all', label: 'All supported agents', hint: 'Install on each compatible surface' },
    ],
  });
  if (ai === null) return stop();

  const scope = await choose({
    message: 'Installation scope',
    initialValue: defaults.scope ?? 'project',
    options: [
      { value: 'project', label: 'Project', hint: 'Only this repository' },
      { value: 'global', label: 'Global', hint: 'User-wide across repositories' },
    ],
  });
  if (scope === null) return stop();

  const profileName = await choose({
    message: 'Base skill profile',
    initialValue: defaults.profile ?? 'none',
    options: [
      { value: 'none', label: 'None · select skills individually' },
      ...Object.entries(PROFILES).map(([name, ids]) => ({
        value: name, label: name, hint: ids.length + ' skills',
      })),
    ],
  });
  if (profileName === null) return stop();

  const baseIds = new Set(profileName === 'none' ? [] : resolveProfile(profileName));
  const explicit = await list({
    message: 'Additional skills · type to search, Space to select, Enter to continue',
    options: ALL_SKILLS
      .filter((skill) => skill.kind === 'primitive' && !baseIds.has(skill.id))
      .map((skill) => ({
        value: skill.id,
        label: skill.id.replace(/^showdar-/, ''),
        hint: skill.domain,
      })),
    required: false,
    maxItems: 9,
    placeholder: 'Search skills...',
  }, true);
  if (explicit === null) return stop();

  const workflows = await list({
    message: 'Built-in workflows (optional)',
    options: ALL_SKILLS
      .filter((skill) => skill.kind === 'workflow')
      .map((skill) => ({
        value: skill.id,
        label: skill.id.replace(/^showdar-/, ''),
        hint: skill.stages.length + ' stages, missing stages installed automatically',
      })),
    required: false,
  });
  if (workflows === null) return stop();

  let plan;
  try {
    plan = buildWizardPlan({
      mode, ai, scope,
      profile: profileName === 'none' ? null : profileName,
      skills: explicit.join(','),
      workflows: workflows.join(','),
    });
  } catch (error) {
    p.log?.warn?.(error.message);
    return stop();
  }

  const alreadyIncluded = baseIds.size;
  note([
    'Operation: ' + (mode === 'add' ? 'Additive (no removal)' : 'Replace Showdar-managed set'),
    'Agent: ' + ai + '  ·  Scope: ' + scope,
    'Profile: ' + (plan.profile ?? 'none') + ' (' + alreadyIncluded + ' built-in skills)',
    'Extra skills: ' + explicit.length + '  ·  Workflows: ' + workflows.length,
    'Unique skills to install: ' + plan.skills.length,
    '',
    ...plan.skills.map((id) => '  • ' + id),
  ].join('\n'), 'Installation preview');

  const approved = await confirm({
    message: mode === 'replace'
      ? 'Replace the installed Showdar-managed skill selection?'
      : 'Install these skills?',
    initialValue: false,
  });
  if (isCancel(approved) || !approved) return stop();

  outro('Selection confirmed. Installing…');
  return { plan, cancelled: false };
}
