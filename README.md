# Showdar Skills

[![npm](https://img.shields.io/npm/v/showdar-skills?logo=npm)](https://www.npmjs.com/package/showdar-skills)
[![Node >=20](https://img.shields.io/badge/node-%3E%3D20-339933?logo=node.js)](https://nodejs.org/)
[![MIT](https://img.shields.io/badge/license-MIT-blue)](./LICENSE)

**Software-engineering skills for AI coding agents.** Showdar helps agents understand, plan, build, debug, test, review, and ship changes using intent-based routing and progressive context loading.

Supports **Cursor, Claude Code, OpenCode, Codex, and Universal Agent Skills**.

## Get started

Requires **Node.js 20+**. From your project root:

```bash
npm install -g showdar-skills
showdar setup
showdar doctor
```

| Step | What it does |
| --- | --- |
| `setup` | Pick AI target, skill profile, optional skills and workflows; preview before installing. |
| Agent setup | Analyze the repository, propose grounded shared context, and update docs after approval. |
| `doctor` | Check the installation and flag problems. |

**OpenCode / Claude Code:** after installation, use `/showdar-setup` to audit the codebase and prepare project context. The agent previews a diff and requests approval before changes. **Cursor / Codex:** ask the agent to audit this repository and set up Showdar project context; there is no native Showdar slash command on those targets.

Already configured? Just give the coding agent a normal task, such as *"Fix the checkout validation bug and add regression tests."* Showdar guidance routes requests to the relevant installed skills; you do not need to call each skill manually.

## Common commands

```bash
showdar status
showdar add profile insurance     # Add, preserving existing skills
showdar add workflow feature      # Include the workflow and missing stages
showdar route --prompt "Review this PR" --json
showdar doctor
```

**Install vs. configure:** `showdar init` installs/replaces a skill selection, `showdar add` extends it, and `showdar setup` is the interactive installer. Project context is created or enriched by the AI agent using repository evidence and explicit approval; the CLI `showdar setup` runs the interactive installer and does not generate project context.

## How it works

```text
User task
  -> Showdar intent routing
  -> Installed lifecycle skill + optional domain context
  -> Git preflight (before writes)
  -> Execute / verify / report
```

Showdar ships **18 primitive** and **4 workflow** skills, including optional insurance-domain coverage. Only relevant instructions and references are loaded as needed.

Before local source/config/docs changes, follow the project's Git policy and run `showdar guard --mutation local-write --json`; work on a task branch when required. Routing and onboarding do not grant permission to commit, merge, push, or deploy.

## Documentation

- [Detailed CLI, profiles, adapters, routing, and policies](./docs/REFERENCE.md)
- [Migration notes](./MIGRATION.md)
- [Changelog](./CHANGELOG.md)
- [Releasing](./RELEASING.md)

## License

[MIT](./LICENSE)
