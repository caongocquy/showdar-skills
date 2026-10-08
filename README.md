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
showdar wizard
showdar setup
showdar doctor
```

| Step | What it does |
| --- | --- |
| `wizard` | Pick AI target, skill profile, optional skills and workflows; preview before installing. |
| `setup` | Detect Git host, stack, scripts, and docs; create missing shared context in `docs/agents/`. |
| `doctor` | Check the installation and flag problems. |

**OpenCode / Claude Code:** after installation, use `/showdar/setup` for agent-guided onboarding. It can help with both skill selection (wizard) and project context (setup); it does not silently install or write files. **Cursor / Codex:** ask the agent to configure Showdar for this repository or use the terminal commands above. Cursor does not currently generate a native slash command.

Already configured? Just give the coding agent a normal task, such as *"Fix the checkout validation bug and add regression tests."* Showdar guidance routes requests to the relevant installed skills; you do not need to call each skill manually.

## Common commands

```bash
showdar status
showdar add profile insurance     # Add, preserving existing skills
showdar add workflow feature      # Include the workflow and missing stages
showdar setup --dry-run --json     # Preview project context
showdar route --prompt "Review this PR" --json
showdar doctor
```

**Install vs. configure:** `showdar init` installs/replaces a skill selection, `showdar add` extends it, and `showdar wizard` is the interactive installer. `showdar setup` does **not** install skills: it creates shared project context. Re-running `setup` keeps existing user-owned context files.

## How it works

```text
User task
  -> Showdar intent routing
  -> Installed lifecycle skill + optional domain context
  -> Git preflight (before writes)
  -> Execute / verify / report
```

Showdar ships **18 primitive** and **4 workflow** skills, including optional insurance-domain coverage. Only relevant instructions and references are loaded as needed.

Before local source/config/docs changes, follow the project's Git policy and run `showdar guard --mutation local-write --json`; work on a task branch when required. Routing and setup do not grant permission to commit, merge, push, or deploy.

## Documentation

- [Detailed CLI, profiles, adapters, routing, and policies](./docs/REFERENCE.md)
- [Migration notes](./MIGRATION.md)
- [Changelog](./CHANGELOG.md)
- [Releasing](./RELEASING.md)

## License

[MIT](./LICENSE)
