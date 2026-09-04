#!/usr/bin/env node
import path from 'node:path';
import { homedir } from 'node:os';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { AI_TARGETS, PROFILE_ALIASES, PROFILES, SKILLS, canonicalProfile, isDeprecatedProfile, resolveProfile } from '../src/catalog.js';
import { globalManifestPath, initGlobal, initProject, inspectGlobal, inspectProject, removeGlobal, removeProject } from '../src/project.js';
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
    console.log(`Showdar Skills ${version}\n\nUsage:\n  showdar init ${scopeUsage} [--profile <name>] [--ai <codex|opencode|claude|universal|all>]\n\nDefaults: scope project, profile full, AI target universal.\nProject scope writes native skills and project .showdar.json. Global scope writes verified user skill directories and ~/.showdar/global.json without project files. Codex and universal use .agents/skills in project scope and ~/.agents/skills in global scope; --ai all writes each shared destination once.\n\nProfiles: ${Object.keys(PROFILES).join(', ')}\nDeprecated aliases: ${Object.entries(PROFILE_ALIASES).map(([alias, target]) => `${alias} -> ${target}`).join(', ')}\nAI targets: ${AI_TARGETS.join(', ')}`);
    return;
  }
  if (['status', 'doctor', 'remove'].includes(command)) {
    console.log(`Showdar Skills ${version}\n\nUsage:\n  showdar ${command} ${scopeUsage}\n\nDefault scope: project. Use --scope global for the user installation.`);
    return;
  }
  console.log(`Showdar Skills ${version}\n\nUsage:\n  showdar init ${scopeUsage} [--profile <name>] [--ai <codex|opencode|claude|universal|all>]\n  showdar status ${scopeUsage}\n  showdar doctor ${scopeUsage}\n  showdar validate\n  showdar list\n  showdar remove ${scopeUsage}\n\nDefaults: scope project, profile full, AI target universal.\nProfiles: ${Object.keys(PROFILES).join(', ')}\nDeprecated aliases: ${Object.entries(PROFILE_ALIASES).map(([alias, target]) => `${alias} -> ${target}`).join(', ')}\nAI targets: ${AI_TARGETS.join(', ')}`);
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] ?? 'help';
  const projectRoot = process.cwd();
  const version = await packageVersion();

  if (command === 'help' || command === '--help' || command === '-h') return printHelp(version);
  if (args.includes('--help') || args.includes('-h')) return printHelp(version, command);

  const scope = ['init', 'status', 'doctor', 'remove'].includes(command) ? scopeAfter(args) : null;

  if (command === 'list') {
    console.log(`Profiles: ${Object.keys(PROFILES).join(', ')}\nDeprecated aliases: ${Object.entries(PROFILE_ALIASES).map(([alias, target]) => `${alias} -> ${target}`).join(', ')}\n\nSkills:`);
    for (const skill of SKILLS) console.log(`  ${skill.id}  [${skill.domain}]  ${skill.description}`);
    return;
  }

  if (command === 'validate') {
    const result = await validateRepository(packageRoot);
    if (result.ok) console.log(`Showdar validation OK (${SKILLS.length} skills).`);
    else {
      console.log(`Showdar validation FAILED (${result.errors.length} errors).`);
      for (const error of result.errors) console.log(`- ${error}`);
      process.exitCode = 1;
    }
    for (const warning of result.warnings) console.log(`warning: ${warning}`);
    return;
  }

  if (command === 'init') {
    if (args.includes('--agent')) throw new Error('--agent is no longer supported in V0.2. Use --ai <codex|opencode|claude|universal|all>.');
    const requestedProfile = valueAfter(args, '--profile', 'full');
    const profile = canonicalProfile(requestedProfile);
    const ai = valueAfter(args, '--ai', 'universal');
    const skillIds = resolveProfile(requestedProfile);
    if (isDeprecatedProfile(requestedProfile)) console.warn(`Warning: profile "${requestedProfile}" is deprecated; use "${profile}".`);
    const commandNames = ai === 'opencode' || ai === 'all' ? COMMANDS : [];
    const result = scope === 'global'
      ? await initGlobal({ homeRoot: homedir(), packageRoot, profile, ai, skillIds, commandNames, packageVersion: version })
      : await initProject({ projectRoot, packageRoot, profile, ai, skillIds, commandNames, packageVersion: version });
    console.log(`Showdar Skills installed.\nScope: ${scope}\nProfile: ${profile}\nAI: ${ai}\nTargets: ${result.targets.join(', ')}\nSkills: ${result.skills}\nOpenCode commands: ${result.commands}`);
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
    for (const issue of result.issues) console.log(`- ${issue}`);
    if (command === 'doctor' && !result.healthy) process.exitCode = 1;
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
