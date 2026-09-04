#!/usr/bin/env node
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { AI_TARGETS, PROFILES, SKILLS, resolveProfile } from '../src/catalog.js';
import { initProject, inspectProject, removeProject } from '../src/project.js';
import { validateRepository } from '../src/validate.js';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const COMMANDS = ['understand', 'plan', 'design', 'build', 'debug', 'test', 'review', 'upgrade', 'ship', 'recover', 'skill'];

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

function printHelp(version) {
  console.log(`Showdar Skills ${version}\n\nUsage:\n  showdar init [--profile <name>] [--ai <codex|opencode|claude|universal|all>]\n  showdar status\n  showdar doctor\n  showdar validate\n  showdar list\n  showdar remove\n\nProfiles: ${Object.keys(PROFILES).join(', ')}\nAI targets: ${AI_TARGETS.join(', ')}`);
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] ?? 'help';
  const projectRoot = process.cwd();
  const version = await packageVersion();

  if (command === 'help' || command === '--help' || command === '-h') return printHelp(version);

  if (command === 'list') {
    console.log(`Profiles: ${Object.keys(PROFILES).join(', ')}\n\nSkills:`);
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
    const profile = valueAfter(args, '--profile', 'full');
    const ai = valueAfter(args, '--ai', 'universal');
    const skillIds = resolveProfile(profile);
    const commandNames = ai === 'opencode' || ai === 'all' ? COMMANDS : [];
    const result = await initProject({ projectRoot, packageRoot, profile, ai, skillIds, commandNames, packageVersion: version });
    console.log(`Showdar Skills installed.\nProfile: ${profile}\nAI: ${ai}\nTargets: ${result.targets.join(', ')}\nSkills: ${result.skills}\nOpenCode commands: ${result.commands}`);
    if (result.targets.includes('codex')) console.log('Codex: invoke skills directly with $showdar-<name> or let native skill discovery route by description.');
    if (result.targets.includes('opencode')) console.log('OpenCode: use native skill discovery or /showdar/<command>.');
    return;
  }

  if (command === 'status' || command === 'doctor') {
    const result = await inspectProject(projectRoot);
    if (!result.installed) {
      console.log('Showdar Skills is not installed in this project.');
      if (command === 'doctor') process.exitCode = 1;
      return;
    }
    console.log(`Showdar Skills\nProfile: ${result.profile}\nAI: ${result.ai}\nTargets: ${result.targets.join(', ')}\nSkills: ${result.skills}\nCommands: ${result.commands}\nHealth: ${result.healthy ? 'OK' : 'BROKEN'}`);
    for (const issue of result.issues) console.log(`- ${issue}`);
    if (command === 'doctor' && !result.healthy) process.exitCode = 1;
    return;
  }

  if (command === 'remove') {
    await removeProject(projectRoot);
    console.log('Showdar Skills removed from this project.');
    return;
  }

  throw new Error(`Unknown command "${command}". Run "showdar --help".`);
}

main().catch((error) => {
  console.error(`showdar: ${error.message}`);
  process.exitCode = 1;
});
