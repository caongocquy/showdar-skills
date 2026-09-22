#!/usr/bin/env node
import path from 'node:path';
import { homedir } from 'node:os';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { AI_TARGETS, PRIMITIVE_COUNT, PROFILE_ALIASES, PROFILES, SKILLS, TOTAL_COUNT, WORKFLOW_COUNT, canonicalProfile, isDeprecatedProfile, resolveProfile } from '../src/catalog.js';
import { addPack, addSkill, addWorkflow, globalManifestPath, initGlobal, initProject, inspectGlobal, inspectProject, listExtensions, removeGlobal, removePack, removeProject } from '../src/project.js';
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
  if (command === 'init') {
    console.log(`Showdar Skills ${version}\n\nUsage:\n  showdar init ${scopeUsage} [--profile <name>] [--ai <universal|codex|opencode|cursor|claude|all>]\n\nDefaults: scope project, profile full, AI target universal.\nProject scope writes native skills, one native instruction surface, and project .showdar.json. Global scope writes verified user skill directories and ~/.showdar/global.json without instruction files. Codex and universal use .agents/skills in project scope and ~/.agents/skills in global scope; cursor uses .cursor/skills in project scope and ~/.cursor/skills in global scope; --ai all writes each shared destination once, generates OpenCode and Claude commands, and writes only the AGENTS.md block.\n\nProfiles: ${Object.keys(PROFILES).join(', ')}\nDeprecated aliases: ${Object.entries(PROFILE_ALIASES).map(([alias, target]) => `${alias} -> ${target}`).join(', ')}\nAI targets: ${AI_TARGETS.join(', ')}`);
    return;
  }
  if (['status', 'doctor', 'remove'].includes(command)) {
    console.log(`Showdar Skills ${version}\n\nUsage:\n  showdar ${command} ${scopeUsage}\n\nDefault scope: project. Use --scope global for the user installation.`);
    return;
  }
  if (command === 'add') {
    console.log(`Showdar Skills ${version}\n\nUsage:\n  showdar add <skill> [--ai <universal|codex|opencode|cursor|claude>] [--scope <project|global>]\n\nExamples:\n  showdar add debug\n  showdar add showdar-security\n  showdar add test --ai cursor\n  showdar add review --scope global --ai claude\n\nDefault scope: project. Default AI target: universal, or the configured .showdar.json value when present.`);
    return;
  }
  console.log(`Showdar Skills ${version}\n\nUsage:\n  showdar init ${scopeUsage} [--profile <name>] [--ai <universal|codex|opencode|cursor|claude|all>] [--pack <local-path>]\n  showdar add <skill> [--ai <universal|codex|opencode|cursor|claude>] [--scope <project|global>]\n  showdar add-pack <local-path>\n  showdar remove-pack <name>\n  showdar add-workflow <local-path>\n  showdar status ${scopeUsage}\n  showdar doctor ${scopeUsage}\n  showdar validate\n  showdar list [--extensions]\n  showdar remove ${scopeUsage}\n\nExtension packs accept local directories/workspace paths only; tarball, URL, Git, and registry sources are rejected.\n\nDefaults: scope project, profile full, AI target universal.\nProfiles: ${Object.keys(PROFILES).join(', ')}\nDeprecated aliases: ${Object.entries(PROFILE_ALIASES).map(([alias, target]) => `${alias} -> ${target}`).join(', ')}\nAI targets: ${AI_TARGETS.join(', ')}`);
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
  if (args.includes('--help') || args.includes('-h')) return printHelp(version, command);

  const scope = ['init', 'status', 'doctor', 'remove', 'add'].includes(command) ? scopeAfter(args) : null;

  if (command === 'list') {
    if (args.includes('--extensions')) {
      const result = await listExtensions({ cwd: projectRoot });
      console.log('Packs:');
      for (const pack of result.packs) console.log(`  ${pack.name}@${pack.version}  ${pack.hash}`);
      console.log('Custom workflows:');
      for (const workflow of result.customWorkflows) console.log(`  ${workflow.id}  [${workflow.source}]  ${workflow.path}`);
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
    const positional = args.filter((a, i) => i > 0 && !a.startsWith('--') && args[i - 1] !== '--ai' && args[i - 1] !== '--scope');
    const skillArg = positional[0];
    if (!skillArg) throw new Error('Skill name is required. Usage: showdar add <skill> [--ai <target>] [--scope <project|global>]');
    const hasAiFlag = args.includes('--ai');
    const hasScopeFlag = args.includes('--scope');
    const result = await addSkill({
      cwd: projectRoot,
      skill: skillArg,
      ai: hasAiFlag ? valueAfter(args, '--ai', 'universal') : null,
      scope: hasScopeFlag ? scope : null,
      home: homedir(),
      packageRoot,
      packageVersion: version,
    });
    console.log(`Showdar skill ${result.added ? 'added' : 'already installed'}.\nSkill: ${result.skill}\nScope: ${result.scope}\nAI: ${result.ai}\nPath: ${result.destination}`);
    return;
  }

  if (command === 'remove') {
    if (scope === 'global') await removeGlobal();
    else await removeProject(projectRoot);
    console.log(`Showdar Skills removed from the ${scope} scope.`);
    return;
  }

  throw new Error(`Unknown command "${command}". Run "showdar --help".`);
}

main().catch((error) => {
  console.error(`showdar: ${error.message}`);
  process.exitCode = 1;
});
