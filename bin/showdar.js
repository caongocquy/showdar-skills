#!/usr/bin/env node
import path from 'node:path';
import { parseArgs } from 'node:util';
import { buildWizardPlan, applyWizardPlan, collectWizardAnswers } from '../src/wizard.js';
import { startTaskBranch, formatGitStart } from '../src/git-start.js';
import { guardMutation, formatMutationGuard } from '../src/git-guard.js';
import { routeRequest, formatRoute } from '../src/runtime-route.js';
import { homedir } from 'node:os';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { AI_TARGETS, PRIMITIVE_COUNT, PROFILE_ALIASES, PROFILES, SKILLS, TOTAL_COUNT, WORKFLOW_COUNT, canonicalProfile, isDeprecatedProfile, resolveProfile, getWorkflow, normalizeSkillName } from '../src/catalog.js';
import { addPack, addSkill, addSkills, addWorkflow, globalManifestPath, initGlobal, initProject, inspectGlobal, inspectProject, listExtensions, listExtensionsDetailed, removeGlobal, removePack, removeProject, validatePackSource, createPack, inspectPack, doctor, updatePack, readProjectOverrides } from '../src/project.js';
import { formatPlanPreviewHuman, projectPackUpdatePreview } from '../src/pack-plan.js';
import { assessCheckpointAgainstCandidate } from '../src/pack-inspect.js';
import { validateRepository } from '../src/validate.js';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const COMMANDS = ['understand', 'plan', 'design', 'build', 'debug', 'test', 'review', 'upgrade', 'ship', 'recover', 'git', 'requirements', 'quality', 'security', 'ops', 'skill'];
const SCOPES = ['project', 'global'];

function valueAfter(args, flag, fallback) {
  const i = args.indexOf(flag);
  if (i === -1) return fallback;
  if (!args[i + 1] || args[i + 1].startsWith('--')) throw new Error(`${flag} requires a value`);
  return args[i + 1];
}

async function packageVersion() {
  const pkg = JSON.parse(await readFile(path.join(packageRoot, 'package.json'), 'utf8'));
  return pkg.version;
}

function scopeAfter(args) {
  const scope = valueAfter(args, '--scope', 'project');
  if (!SCOPES.includes(scope)) throw new Error(`Unknown scope "${scope}". Expected project or global.`);
  return scope;
}

function printHelp(version, command = null) {
  const scopeUsage = '[--scope <project|global>]';
  if (command === 'route') {
    console.log('Usage: showdar route (--stdin | --prompt <text>) [--json]');
    return;
  }
  if (command === 'git-start') {
    console.log('Usage: showdar git-start --type <type> --name <task> [--base <branch>] [--dry-run] [--json]');
    return;
  }
  if (command === 'guard') {
    console.log('Usage: showdar guard --mutation <read-only|local-write> [--json]');
    return;
  }
  if (command === 'setup') {
    console.log('Usage: showdar setup [--mode add|replace] [--profile name] [--skills comma,list] [--workflow comma,list] [--ai target] [--scope project|global] [--yes|--dry-run] [--json]');
    return;
  }
  if (command === 'init') {
    console.log(`Showdar Skills ${version}\n\nUsage:\n  showdar init ${scopeUsage} [--profile <name>] [--ai <universal|codex|opencode|cursor|claude|all>]\n\nDefaults: scope project, profile full, AI target universal.\nProject scope writes native skills, one native instruction surface, and project .showdar.json. Global scope writes verified user skill directories and ~/.showdar/global.json without instruction files. Codex and universal use .agents/skills in project scope and ~/.agents/skills in global scope; cursor uses .cursor/skills in project scope and ~/.cursor/skills in global scope; --ai all writes each shared destination once, generates OpenCode and Claude commands, and writes only the AGENTS.md block.\n\nProfiles: ${Object.keys(PROFILES).join(', ')}\nDeprecated aliases: ${Object.entries(PROFILE_ALIASES).map(([alias, target]) => `${alias} -> ${target}`).join(', ')}\nAI targets: ${AI_TARGETS.join(', ')}`);
    return;
  }
  if (['status', 'doctor', 'remove'].includes(command)) {
    console.log(`Showdar Skills ${version}\n\nUsage:\n  showdar ${command} ${scopeUsage}\n\nDefault scope: project. Use --scope global for the user installation.`);
    return;
  }
  if (command === 'add') {
    console.log(`Showdar Skills ${version}\n\nUsage:\n  showdar add <skill> [--ai <target>] [--scope <project|global>]\n  showdar add profile <profile> [--ai <target>] [--scope <project|global>]\n  showdar add workflow <builtin-name|local-json-path> [--ai <target>] [--scope <project|global>]\n\nExamples:\n  showdar add git\n  showdar add showdar-git\n  showdar add profile insurance\n  showdar add workflow feature\n  showdar add workflow ./workflows/acme-release.json\n\nAdd preserves installed skills; init replaces the managed set. Built-in workflows add required stages.`);
    return;
  }
  console.log(`Showdar Skills ${version}\n\nUsage:\n  showdar init ${scopeUsage} [--profile <name>] [--ai <universal|codex|opencode|cursor|claude|all>] [--pack <local-path>]\n  showdar add <skill> [--ai <target>] [--scope <project|global>]\n  showdar add profile <profile> [--ai <target>] [--scope <project|global>]\n  showdar add workflow <builtin-name|local-json-path> [--ai <target>] [--scope <project|global>]\n  showdar route (--stdin | --prompt <text>) [--json]\n  showdar git-start --type <type> --name <task> [--base <branch>] [--dry-run] [--json]\n  showdar guard --mutation <read-only|local-write> [--json]\n  showdar setup [--mode add|replace] [--profile <name>] [--skills <names>] [--workflow <names>] [--ai <target>] [--scope <project|global>] [--yes|--dry-run]\n  showdar add-pack <local-path>\n  showdar remove-pack <name>\n  showdar add-workflow <local-path>\n  showdar status ${scopeUsage}\n  showdar doctor ${scopeUsage}\n  showdar validate\n  showdar list [--extensions]\n  showdar remove ${scopeUsage}\n  showdar create-pack <path> [--vendor <vendor>] [--description <text>] [--with-workflow <id>] [--with-profile <name>]\n  showdar validate-pack <local-path> [--json]\n  showdar inspect-pack <local-path> [--json] [--checkpoint <file>]\n  showdar doctor ${scopeUsage} [--extensions] [--json]\n  showdar update-pack <local-path> [--dry-run] [--json]\n  showdar validate\n  showdar list [--extensions] [--json]\n  showdar remove ${scopeUsage}\n\nExtension packs accept local directories/workspace paths only; tarball, URL, Git, and registry sources are rejected.\n\nDefaults: scope project, profile full, AI target universal.\nProfiles: ${Object.keys(PROFILES).join(', ')}\nDeprecated aliases: ${Object.entries(PROFILE_ALIASES).map(([alias, target]) => `${alias} -> ${target}`).join(', ')}\nAI targets: ${AI_TARGETS.join(', ')}`);
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] ?? 'help';
  const projectRoot = process.cwd();
  const version = await packageVersion();

  if (command === 'help' || command === '--help' || command === '-h') return printHelp(version);
    if (command === '--version' || command === '-V') {
    console.log(version);
    return;
  }
  if (!['route', 'git-start', 'guard'].includes(command) && (args.includes('--help') || args.includes('-h'))) return printHelp(version, command);

  const scope = ['init', 'status', 'doctor', 'remove', 'add'].includes(command) ? scopeAfter(args) : null;

  if (command === 'setup' || (command === 'add' && args.includes('--interactive'))) {
    const wizardArgs = command === 'add' ? args.filter(a => a !== '--interactive').slice(1) : args.slice(1);
    const { values } = parseArgs({ args: wizardArgs, options: {
      mode: { type: 'string' }, profile: { type: 'string' },
      skills: { type: 'string' }, workflow: { type: 'string' },
      ai: { type: 'string' }, scope: { type: 'string' },
      yes: { type: 'boolean' }, 'dry-run': { type: 'boolean' },
      json: { type: 'boolean' }, help: { type: 'boolean', short: 'h' },
    } });
    if (values.help) return printHelp(version, 'setup');
    let plan;
    if (values.yes || values['dry-run']) {
      plan = buildWizardPlan({
        mode: values.mode ?? 'add', profile: values.profile ?? null,
        skills: values.skills ?? '', workflows: values.workflow ?? '',
        ai: values.ai ?? 'universal', scope: values.scope ?? 'project',
      });
    } else {
      const collected = await collectWizardAnswers({
        mode: values.mode, profile: values.profile, skills: values.skills,
        workflows: values.workflow, ai: values.ai, scope: values.scope,
      });
      if (collected.cancelled) { console.log('Wizard cancelled without changes.'); return; }
      plan = collected.plan;
    }
    if (values['dry-run']) {
      console.log(values.json ? JSON.stringify({ ok: true, command: 'setup', data: plan }, null, 2)
        : 'Wizard preview (' + plan.action + '): ' + plan.skills.join(', '));
      return;
    }
    const installed = await applyWizardPlan({
      cwd: projectRoot, home: homedir(), packageRoot, packageVersion: version, plan,
    });
    console.log(values.json ? JSON.stringify({ ok: true, command: 'wizard', data: { plan, installed } }, null, 2)
      : 'Wizard completed: ' + plan.action + ' ' + plan.skills.length + ' skills. Run showdar doctor to verify.');
    return;
  }

  if (command === 'guard') {
    const { values } = parseArgs({ args: args.slice(1), options: { mutation: { type: 'string' }, json: { type: 'boolean' }, help: { type: 'boolean', short: 'h' } } });
    if (values.help) return printHelp(version, command);
    const data = guardMutation({ cwd: projectRoot, mutation: values.mutation });
    const errors = data.allowed ? [] : [{ code: data.code, message: 'Task-owned source mutation is blocked until Git preflight passes.' }];
    console.log(values.json
      ? JSON.stringify({ schemaVersion: 1, command, ok: data.allowed, data, warnings: [], errors }, null, 2)
      : formatMutationGuard(data));
    if (!data.allowed) process.exitCode = 1;
    return;
  }

  if (command === 'git-start') {
    const { values } = parseArgs({ args: args.slice(1), options: { type: { type: 'string' }, name: { type: 'string' }, base: { type: 'string' }, 'dry-run': { type: 'boolean' }, json: { type: 'boolean' }, help: { type: 'boolean', short: 'h' } } });
    if (values.help) return printHelp(version, command);
    const data = startTaskBranch({ cwd: projectRoot, type: values.type, name: values.name, base: values.base, dryRun: values['dry-run'] });
    console.log(values.json ? JSON.stringify({ schemaVersion: 1, command, ok: true, data, warnings: [], errors: [] }, null, 2) : formatGitStart(data));
    return;
  }

  if (command === 'route') {
    const { values } = parseArgs({ args: args.slice(1), options: { stdin: { type: 'boolean' }, prompt: { type: 'string' }, json: { type: 'boolean' }, help: { type: 'boolean', short: 'h' } } });
    if (values.help) return printHelp(version, command);
    if (Boolean(values.stdin) === (values.prompt !== undefined)) throw new Error('Select exactly one of --stdin or --prompt.');
    let prompt = values.prompt;
    if (values.stdin) {
      process.stdin.setEncoding('utf8');
      prompt = '';
      for await (const chunk of process.stdin) prompt += chunk;
    }
    const data = await routeRequest({ prompt, cwd: projectRoot, packageRoot });
    console.log(values.json ? JSON.stringify({ schemaVersion: 1, command, ok: true, data, warnings: [], errors: [] }, null, 2) : formatRoute(data));
    return;
  }

  if (command === 'list') {
    if (args.includes('--extensions')) {
      const isJson = args.includes('--json');
      const result = await listExtensionsDetailed({ cwd: projectRoot });
      if (isJson) {
        console.log(JSON.stringify({ schemaVersion: 1, command: 'list', ok: true, data: result, warnings: [], errors: [] }, null, 2));
        return;
      }
      console.log('Packs:');
      for (const pack of result.packs) console.log(`  ${pack.name}@${pack.version}  ${pack.status ?? 'healthy'}  ${pack.hash}`);
      console.log('Custom workflows:');
      for (const workflow of result.customWorkflows) console.log(`  ${workflow.id}  [${workflow.source}]  ${workflow.path}`);
      if (result.profiles?.length) {
        console.log('Pack profiles:');
        for (const profile of result.profiles) console.log(`  ${profile.name}  [${profile.source}]  members: ${(profile.members ?? []).join(', ')}`);
      }
      console.log(`Project overrides: ${result.overrides.present ? result.overrides.status : 'absent'}`);
      return;
    }
    console.log(`Profiles: ${Object.keys(PROFILES).join(', ')}\nDeprecated aliases: ${Object.entries(PROFILE_ALIASES).map(([alias, target]) => `${alias} -> ${target}`).join(', ')}\n\nSkills:`);
    for (const skill of SKILLS) console.log(`  ${skill.id}  [${skill.domain}]  ${skill.description}`);
    return;
  }

  if (command === 'add-pack') {
    const packSource = args[1];
    if (!packSource) throw new Error('Pack source is required. Usage: showdar add-pack <local-path>');
    const result = await addPack({ cwd: projectRoot, source: packSource, packageVersion: version });
    console.log(`Showdar pack added.\nPack: ${result.pack}\nFiles: ${result.files}\nHash: ${result.hash}\nPath: ${result.destination}`);
    return;
  }

  if (command === 'remove-pack') {
    const packName = args[1];
    if (!packName) throw new Error('Pack name is required. Usage: showdar remove-pack <name>');
    await removePack({ cwd: projectRoot, name: packName });
    console.log(`Showdar pack removed: ${packName}`);
    return;
  }

  if (command === 'add-workflow') {
    const workflowSource = args[1];
    if (!workflowSource) throw new Error('Workflow source is required. Usage: showdar add-workflow <local-path>');
    const result = await addWorkflow({ cwd: projectRoot, source: workflowSource });
    console.log(`Showdar workflow added.\nWorkflow: ${result.workflow}\nPath: ${result.path}`);
    return;
  }

  if (command === 'validate') {
    const result = await validateRepository(packageRoot);
    if (result.ok) console.log(`Showdar validation OK (${PRIMITIVE_COUNT} primitives, ${WORKFLOW_COUNT} workflows, ${TOTAL_COUNT} total).`);
    else {
      console.log(`Showdar validation FAILED (${result.errors.length} errors).`);
      for (const error of result.errors) console.log(`- ${error}`);
      process.exitCode = 1;
    }
    for (const warning of result.warnings) console.log(`warning: ${warning}`);
    return;
  }

  if (command === 'init') {
    if (args.includes('--agent')) throw new Error('--agent is no longer supported in V0.2. Use --ai <universal|codex|opencode|cursor|claude|all>.');
    const requestedProfile = valueAfter(args, '--profile', 'full');
    const profile = canonicalProfile(requestedProfile);
    const ai = valueAfter(args, '--ai', 'universal');
    const skillIds = resolveProfile(requestedProfile);
    if (isDeprecatedProfile(requestedProfile)) console.warn(`Warning: profile "${requestedProfile}" is deprecated; use "${profile}".`);
    const packSource = valueAfter(args, '--pack', null);
    if (packSource && scope === 'global') throw new Error('--pack is only supported with project scope in 0.8.');
    const result = scope === 'global'
      ? await initGlobal({ homeRoot: homedir(), packageRoot, profile, ai, skillIds, packageVersion: version })
      : await initProject({ projectRoot, packageRoot, profile, ai, skillIds, packageVersion: version });
    if (packSource) {
      const pack = await addPack({ cwd: projectRoot, source: packSource, packageVersion: version });
      console.log(`Pack: ${pack.pack}@${pack.version ?? ''}  Hash: ${pack.hash}`);
    }
    console.log(`Showdar Skills installed.\nScope: ${scope}\nProfile: ${profile}\nAI: ${ai}\nTargets: ${result.targets.join(', ')}\nSkills: ${result.skills}\nOpenCode commands: ${result.commands}`);
    if (scope === 'project') {
      console.log(`Requested: ${result.requestedSkills}\nInstalled in project: ${result.installedSkills}\nSatisfied by global: ${result.satisfiedByGlobal}\nSkipped duplicate copies: ${result.skippedDuplicates}`);
    }
    for (const warning of result.warnings ?? []) console.log(`warning: ${warning}`);
    if (scope === 'global') console.log(`Manifest: ${globalManifestPath()}`);
    if (result.targets.includes('codex')) console.log('Codex: invoke skills directly with $showdar-<name> or let native skill discovery route by description.');
    if (result.targets.includes('opencode')) console.log('OpenCode: use native skill discovery or /showdar/<command>.');
    return;
  }

  if (command === 'status' || command === 'doctor') {
    if (command === 'doctor' && args.includes('--extensions')) {
      const isJson = args.includes('--json');
      const result = await doctor({ cwd: projectRoot });
      if (isJson) {
        console.log(JSON.stringify({
          schemaVersion: 1,
          command: 'doctor',
          ok: true,
          data: { ...result, checkpointCompatibility: 'not-assessed' },
          warnings: result.warnings ?? [],
          errors: [],
        }, null, 2));
        return;
      }
      console.log(`Extension diagnostics\nHealth: ${result.healthy ? 'OK' : 'BROKEN'}`);
      for (const pack of result.packs) console.log(`  ${pack.name}@${pack.version}  ${pack.drift}`);
      for (const wf of result.customWorkflows) console.log(`  workflow ${wf.id}: ${wf.valid ? 'valid' : 'invalid'}`);
      for (const issue of result.issues) console.log(`- ${issue}`);
      for (const warning of result.warnings ?? []) console.log(`warning: ${warning}`);
      if (!result.healthy) {
        console.log(`Checkpoint compatibility: not-assessed (supply a checkpoint via inspect-pack --checkpoint)`);
        if (result.customWorkflows.length) console.log(`Note: checkpoints referencing changed workflow definitions will be revalidated on resume.`);
      }
      return;
    }
    const result = scope === 'global' ? await inspectGlobal() : await inspectProject(projectRoot);
    if (!result.installed) {
      console.log(`Showdar Skills is not installed in the ${scope} scope.`);
      if (command === 'doctor') process.exitCode = 1;
      return;
    }
    console.log(`Showdar Skills\nScope: ${result.scope}\nProfile: ${result.profile}\nAI: ${result.ai}\nTargets: ${result.targets.join(', ')}\nSkills: ${result.skills}\nCommands: ${result.commands}\nHealth: ${result.healthy ? 'OK' : 'BROKEN'}`);
    if (scope === 'project') console.log(`Requested: ${result.requestedSkills}\nInstalled in project: ${result.installedSkills}\nSatisfied by global: ${result.satisfiedByGlobal}`);
    for (const issue of result.issues) console.log(`- ${issue}`);
    for (const warning of result.warnings ?? []) console.log(`warning: ${warning}`);
    if (command === 'doctor' && !result.healthy) process.exitCode = 1;
    return;
  }

  if (command === 'add') {
    const positional = args.filter((arg, index) => index > 0 && !arg.startsWith('--') && args[index - 1] !== '--ai' && args[index - 1] !== '--scope');
    const kind = positional[0];
    if (!kind) throw new Error('Usage: showdar add <skill> | profile <profile> | workflow <builtin-name|local-json-path>');
    const hasAiFlag = args.includes('--ai');
    const hasScopeFlag = args.includes('--scope');
    const options = {
      cwd: projectRoot,
      ai: hasAiFlag ? valueAfter(args, '--ai', 'universal') : null,
      scope: hasScopeFlag ? scope : null,
      home: homedir(),
      packageRoot,
      packageVersion: version,
    };
    if (kind === 'profile') {
      if (positional.length !== 2) throw new Error('Usage: showdar add profile <profile> [--ai <target>] [--scope <project|global>]');
      const profileName = positional[1];
      const selected = resolveProfile(profileName);
      const result = await addSkills({ ...options, skills: selected });
      if (isDeprecatedProfile(profileName)) console.warn(`Warning: profile "${profileName}" is deprecated; use "${canonicalProfile(profileName)}".`);
      console.log(`Showdar profile added.\nAdded profile: ${canonicalProfile(profileName)}\nNew skills: ${result.added}\nAlready installed: ${result.alreadyInstalled}\nTotal requested: ${result.skills.length}\nExisting profile preserved: ${result.profile ?? '(none)'}\nScope: ${result.scope}\nAI: ${result.ai}`);
      return;
    }
    const installBuiltinWorkflow = async workflow => {
      const result = await addSkills({ ...options, skills: [workflow.id, ...workflow.stages] });
      console.log(`Showdar workflow added.\nWorkflow: ${workflow.id}\nNew skills: ${result.added}\nAlready installed: ${result.alreadyInstalled}\nRequired stage skills: ${workflow.stages.join(', ')}\nScope: ${result.scope}\nAI: ${result.ai}`);
    };
    if (kind === 'workflow') {
      if (positional.length !== 2) throw new Error('Usage: showdar add workflow <builtin-name|local-json-path>');
      const name = positional[1];
      const builtin = getWorkflow(name.startsWith('showdar-') ? name : `showdar-${name}`);
      if (builtin) return installBuiltinWorkflow(builtin);
      if (!name.endsWith('.json')) throw new Error(`Unknown built-in workflow "${name}". For custom workflows provide a local JSON file.`);
      if (hasAiFlag || (hasScopeFlag && scope !== 'project')) {
        throw new Error('Custom workflow files support project scope only and do not accept --ai.');
      }
      const result = await addWorkflow({ cwd: projectRoot, source: name });
      console.log(`Showdar custom workflow added.\nWorkflow: ${result.workflow}\nPath: ${result.path}`);
      return;
    }
    if (positional.length !== 1) throw new Error('Usage: showdar add <skill> [--ai <target>] [--scope <project|global>]');
    const workflow = getWorkflow(normalizeSkillName(kind));
    if (workflow) return installBuiltinWorkflow(workflow);
    const result = await addSkill({ ...options, skill: kind });
    console.log(`Showdar skill ${result.added ? 'added' : 'already installed'}.\nSkill: ${result.skill}\nScope: ${result.scope}\nAI: ${result.ai}\nPath: ${result.destination}`);
    return;
  }

  if (command === 'remove') {
    if (scope === 'global') await removeGlobal();
    else await removeProject(projectRoot);
    console.log(`Showdar Skills removed from the ${scope} scope.`);
    return;
  }

  if (command === 'create-pack') {
    const packPath = args[1];
    if (!packPath) throw new Error('Pack path is required. Usage: showdar create-pack <path> [--vendor <vendor>] [--description <text>] [--with-workflow <id>] [--with-profile <name>]');
    const vendor = valueAfter(args, '--vendor', 'custom');
    const description = valueAfter(args, '--description', null);
    const withWorkflow = valueAfter(args, '--with-workflow', null);
    const withProfile = valueAfter(args, '--with-profile', null);
    const result = await createPack({ cwd: projectRoot, path: packPath, vendor, description, withWorkflow, withProfile });
    console.log(`Showdar pack scaffolded.\nPack: ${result.manifest.name}\nVersion: ${result.manifest.version}\nSkill: ${result.skillId}${result.workflowId ? `\nWorkflow: ${result.workflowId}` : ''}${result.profileName ? `\nProfile: ${result.profileName}` : ''}\nPath: ${result.packDir}`);
    return;
  }

  if (command === 'validate-pack') {
    const packPath = args[1];
    if (!packPath) throw new Error('Pack path is required. Usage: showdar validate-pack <local-path> [--json]');
    const isJson = args.includes('--json');
    const result = await validatePackSource({ cwd: projectRoot, source: packPath });
    if (isJson) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      if (result.ok) {
        console.log(`Pack validation OK`);
      } else {
        console.log(`Pack validation FAILED (${result.errors.length} errors).`);
        for (const error of result.errors) console.log(`- ${error}`);
        process.exitCode = 1;
      }
    }
    return;
  }

  if (command === 'inspect-pack') {
    const packPath = args[1];
    if (!packPath) throw new Error('Pack path is required. Usage: showdar inspect-pack <local-path> [--json] [--checkpoint <file>]');
    const isJson = args.includes('--json');
    const checkpointIdx = args.indexOf('--checkpoint');
    const checkpointFile = checkpointIdx === -1 ? null : args[checkpointIdx + 1];
    if (checkpointIdx !== -1 && (!checkpointFile || checkpointFile.startsWith('--'))) {
      throw new Error('--checkpoint requires a file path');
    }
    if (checkpointFile) {
      const { readFile } = await import('node:fs/promises');
      const checkpoint = await readFile(path.resolve(projectRoot, checkpointFile), 'utf8');
      const assessment = await assessCheckpointAgainstCandidate({ cwd: projectRoot, candidatePath: path.resolve(projectRoot, packPath), checkpoint });
      if (isJson) {
        console.log(JSON.stringify({ schemaVersion: 1, command: 'inspect-pack', ok: true, data: { checkpoint: assessment }, warnings: [], errors: [] }, null, 2));
        return;
      }
      if (assessment.compatible) {
        console.log(`Checkpoint compatibility: compatible\nReplan required: no`);
        return;
      }
      console.log(`Checkpoint compatibility: ${assessment.category === 'schema-invalid' ? 'malformed' : 'workflow-incompatible'}\nReplan required: ${assessment.replanRequired ? 'yes' : 'no'}\nCategory: ${assessment.category}\nReason: ${assessment.reason}\nDetail: ${assessment.detail}`);
      if (assessment.affectedWorkflow) console.log(`Affected workflow: ${assessment.affectedWorkflow}`);
      if (assessment.affectedStage) console.log(`Affected stage: ${assessment.affectedStage}`);
      console.log(`\nRun \`showdar update-pack <path> --dry-run\` to preview update.`);
      return;
    }
    const result = await inspectPack({ cwd: projectRoot, source: packPath });
    if (isJson) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      if (result.ok) {
        console.log(`Pack: ${result.name}@${result.version}`);
        console.log(`Description: ${result.description}`);
        console.log(`Source: ${result.source}`);
        console.log(`Full-tree hash: ${result.fullTreeHash}`);
        console.log(`Skills: ${result.skills.length}`);
        console.log(`Workflows: ${result.workflows.length}`);
        console.log(`Profiles: ${Object.keys(result.profiles).length}`);
        if (result.errors.length > 0) {
          console.log(`Errors: ${result.errors.length}`);
          for (const error of result.errors) console.log(`  - ${error}`);
        }
        if (result.warnings.length > 0) {
          console.log(`Warnings: ${result.warnings.length}`);
          for (const warning of result.warnings) console.log(`  - ${warning}`);
        }
      } else {
        console.log(`Inspection FAILED (${result.errors.length} errors).`);
        for (const error of result.errors) console.log(`- ${error}`);
        process.exitCode = 1;
      }
    }
    return;
  }

  if (command === 'update-pack') {
    const packSource = args[1];
    if (!packSource) throw new Error('Pack source is required. Usage: showdar update-pack <local-path> [--dry-run] [--json]');
    const dryRun = args.includes('--dry-run');
    const isJson = args.includes('--json');
    if (dryRun) {
      const { planPackUpdate } = await import('../src/pack-plan.js');
      const plan = await planPackUpdate({ cwd: projectRoot, source: packSource });
      if (isJson) {
        console.log(JSON.stringify(projectPackUpdatePreview(plan), null, 2));
        if (!plan.ok || !plan.executable) process.exitCode = 1;
        return;
      }
      console.log(formatPlanPreviewHuman(plan));
      if (!plan.ok || !plan.executable) process.exitCode = 1;
      return;
    }
    if (isJson) {
      try {
        const result = await updatePack({ cwd: projectRoot, source: packSource });
        console.log(JSON.stringify({ schemaVersion: 1, command: 'update-pack', ok: true, data: result, warnings: result.plan?.warnings ?? [], errors: [] }, null, 2));
      } catch (error) {
        console.log(JSON.stringify({ schemaVersion: 1, command: 'update-pack', ok: false, data: null, warnings: [], errors: [{ category: 'drift-detected', code: 'DRIFT_DETECTED', message: error.message }] }, null, 2));
        process.exitCode = 1;
      }
      return;
    }
    try {
      const result = await updatePack({ cwd: projectRoot, source: packSource });
      console.log(`Showdar pack ${result.status}.\nPack: ${result.pack}\nVersion: ${result.version}${result.oldHash ? `\nOld hash: ${result.oldHash}\nNew hash: ${result.newHash}` : ''}\nFiles: ${result.files}`);
    } catch (error) {
      console.error(`showdar: ${error.message}`);
      process.exitCode = 1;
    }
    return;
  }
}

main().catch((error) => {
  const command = process.argv[2];
  if (['route', 'git-start', 'guard'].includes(command) && process.argv.slice(3).includes('--json')) {
    console.log(JSON.stringify({ schemaVersion: 1, command, ok: false, data: null, warnings: [], errors: [{ code: 'INVALID_REQUEST', message: error.message }] }, null, 2));
  } else console.error(`showdar: ${error.message}`);
  process.exitCode = 1;
});
