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

**Portable skills:** native agent discovery works with `npx skills add caongocquy/showdar-skills` without the Showdar CLI. Invoke `showdar-setup` by name (or `/showdar-setup` where the agent supports skill slash-invocation). **CLI:** `showdar setup` remains the interactive installer. The setup skill audits project context and proposes Glossary changes with explicit approval; ADRs require actual decisions.

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

## Portable companions

- `showdar-setup`: repository evidence audit, project context onboarding and optional glossary bootstrap; user approval before writing.
- `showdar-brainstorm`: conditional questioning for material ambiguity. After refinement starts, a complete Decision Brief must receive explicit approval before implementation; skip when work is already defined.
- `showdar-domain-model`: read canonical terminology and ADRs when relevant; propose edits for accepted domain definitions or real architecture decisions, and write only after approval.

Use `showdar add brainstorm` or `/showdar-brainstorm`. The retired skill name is not a CLI alias. Existing v0.16.0 installs should update their profile; Showdar-managed legacy copies are migrated only when unchanged. Independent Skills CLI installs must be updated with that installer.

For longer work, `showdar-plan` may persist a plan in the repository's canonical plans location (default `docs/plans/<feature>.md`) with stable task IDs and a verification ledger. `showdar-build` resumes from that plan, but a checkbox is not proof and a plan is not Git or implementation authority.

Companions are native-discoverable and first-class installable skills, not primary lifecycle routes. `showdar-feature` consults refine only when decisions can alter behavior, and handoff reuses approved specs rather than asking again. Specs follow adaptive persistence: use existing canonical tickets/docs first; create a durable spec for complex cross-session work, and keep small same-session briefs in conversation.

## Version and updates

```bash
showdar -v                 # Also supports --version and -V
showdar update             # Auto-detect npm, pnpm, or Homebrew global installation
showdar upgrade            # Alias of update
showdar update --dry-run   # Preview without changing anything
showdar update --manager npm   # Explicit override: npm, pnpm, brew
```

`update` upgrades the globally installed Showdar CLI via the detected package manager and does **not** automatically rewrite skill copies in existing projects. When a package manager cannot be safely identified (for example, local source checkouts or ephemeral `npx` installs), it stops and prints manual installation options. Installing only portable skills through `npx skills add` does not install the Showdar CLI. Use `showdar update-pack` for extension packs; it is separate from updating the CLI.

## How it works

```text
User task
  -> Showdar intent routing
  -> Installed lifecycle skill + optional domain context
  -> Git preflight (before writes)
  -> Execute / verify / report
```

Showdar ships **18 lifecycle primitives**, **3 portable companion** and **4 workflow** skills, including optional insurance-domain coverage. Only relevant instructions and references are loaded as needed.

Before local source/config/docs changes, follow the project's Git policy and run `showdar guard --mutation local-write --json`; work on a task branch when required. Routing and onboarding do not grant permission to commit, merge, push, or deploy.

## Documentation

- [Detailed CLI, profiles, adapters, routing, and policies](./docs/REFERENCE.md)
- [Migration notes](./MIGRATION.md)
- [Changelog](./CHANGELOG.md)
- [Releasing](./RELEASING.md)

## License

[MIT](./LICENSE)
