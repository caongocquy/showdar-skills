import { createInterface } from 'node:readline/promises';
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
export async function collectWizardAnswers(defaults = {}) {
  if (!stdin.isTTY || !stdout.isTTY) {
    throw new Error('Interactive wizard requires a TTY. Use --profile/--skills/--workflow with --yes or --dry-run in CI.');
  }
  const rl = createInterface({ input: stdin, output: stdout });
  async function ask(label, defaultValue) {
    const response = (await rl.question(label + ' [' + defaultValue + ']: ')).trim();
    return response || defaultValue;
  }
  try {
    stdout.write('\nShowdar installation wizard (no files changed until confirmation)\n');
    const mode = await ask('Mode (add/replace)', defaults.mode || 'add');
    const ai = await ask('AI target (' + [...NATIVE_TARGETS, 'all'].join('/') + ')', defaults.ai || 'universal');
    const scope = await ask('Scope (project/global)', defaults.scope || 'project');
    stdout.write('Available profiles: ' + Object.keys(PROFILES).join(', ') + '\n');
    const profile = await ask('Profile (or none)', defaults.profile || 'none');
    stdout.write('Available skills: ' + ALL_SKILLS.map(s => s.id.replace(/^showdar-/, '')).join(', ') + '\n');
    const skills = await ask('Extra skills (comma-separated, or none)', defaults.skills || 'none');
    const workflows = await ask('Built-in workflows (comma-separated, or none)', defaults.workflows || 'none');
    const plan = buildWizardPlan({
      mode, ai, scope, profile: profile === 'none' ? null : profile,
      skills: skills === 'none' ? '' : skills,
      workflows: workflows === 'none' ? '' : workflows,
    });
    stdout.write('\nPreview: ' + plan.action + ' ' + plan.skills.length +
      ' skills on ' + plan.ai + ' (' + plan.scope + ')\n' +
      plan.skills.map(s => '  - ' + s).join('\n') + '\n');
    const confirm = await ask('Apply changes? (yes/no)', 'no');
    if (confirm !== 'yes') return { plan, cancelled: true };
    return { plan, cancelled: false };
  } finally { rl.close(); }
}
