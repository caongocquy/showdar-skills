# Showdar Skills

[![npm version](https://img.shields.io/npm/v/showdar-skills?logo=npm)](https://www.npmjs.com/package/showdar-skills)
[![Node >=20](https://img.shields.io/badge/node-%3E%3D20-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![MIT License](https://img.shields.io/badge/license-MIT-blue?logo=opensourceinitiative&logoColor=white)](./LICENSE)
[![15 skills](https://img.shields.io/badge/skills-15-6f42c1)](#skill-catalog)

Production-grade software engineering skills for coding agents. Showdar covers
the full lifecycle—from requirements and planning through implementation, QA,
security, operations, release readiness, and Git—with lightweight intent
routing and progressive knowledge loading.

## Quick start

Install the CLI, then install a role-oriented skill profile into your project:

```bash
npm install -g showdar-skills
cd my-project
showdar init --ai codex --profile developer
showdar doctor
```

To install from source instead:

```bash
git clone https://github.com/caongocquy/showdar-skills.git
cd showdar-skills
npm install -g .
```

Showdar works with Codex, OpenCode, Claude Code, and universal agent skill
directories. Choose `backend`, `qa`, or `product` when that gives discovery a
more precise context; use `full` when you want all capabilities available.

## Why Showdar?

- **15 focused skills** instead of one oversized agent prompt.
- **Lifecycle coverage** from product rules to implementation, verification,
  security, operations, release readiness, and Git completion.
- **Intent-based discovery** that selects the workflow matching the request.
- **Progressive knowledge loading** for deeper references, data, scripts, and
  examples only when the selected task needs them.
- **Safe boundaries** around security findings, production operations, release
  readiness, and destructive Git actions.

## How it works

```text
User request
     |
     v
Lightweight discovery metadata
     |
     v
Selected Showdar skill
     |
     v
SKILL.md
     |
     +--> data/
     +--> references/
     +--> scripts/
     +--> examples/
          only when needed
```

The 15 skills are not eagerly loaded as full prompts. Lightweight descriptions
help the agent choose one skill; that skill then loads its workflow and deeper
knowledge progressively.

## Supported agents

| Target | Project destination | Global destination |
| --- | --- | --- |
| Codex / Universal | `.agents/skills/` | `~/.agents/skills/` |
| OpenCode skills | `.opencode/skills/` | `~/.config/opencode/skills/` |
| OpenCode commands | `.opencode/commands/showdar/` | `~/.config/opencode/commands/showdar/` |
| Claude Code | `.claude/skills/` | `~/.claude/skills/` |

Codex and Universal intentionally share `.agents/skills/`. OpenCode receives
both skills and native `/showdar/...` command files.

## Project and global installation

Global CLI installation and global skill installation are separate decisions.
The CLI is installed once; `showdar init` controls where its managed skills go.

### Project scope

Project scope is the default and writes to the current project:

```bash
cd my-project
showdar init --ai codex --profile developer
showdar status
showdar doctor
```

This creates `.agents/skills/` for Codex/Universal, or the corresponding native
target directories. Project ownership is recorded in `.showdar.json`.

### Global scope

Global scope installs user-level skills and does not require a Git repository:

```bash
showdar init --scope global --ai codex --profile developer
showdar status --scope global
showdar doctor --scope global
```

Global ownership is recorded in `~/.showdar/global.json`. Only Showdar-owned
paths are refreshed or removed.

## Profiles

Role-specific profiles improve routing precision. `full` exposes every skill,
but still does not eagerly load every skill body.

| Profile | Skills | Best for |
| --- | ---: | --- |
| `minimal` | 8 | Focused everyday assistance |
| `developer` | 12 | General application development |
| `backend` | 14 | APIs, services, and runtime operations |
| `qa` | 9 | Testing and quality workflows |
| `product` | 6 | Product, requirements, and design work |
| `full` | 15 | All capabilities |

Legacy aliases remain compatible:

```text
mobile -> developer
web    -> developer
```

New manifests store the canonical `developer` profile.

## Skill catalog

All 15 entries are first-class Showdar skills.

### Analysis and planning

| Skill | Use when |
| --- | --- |
| `showdar-understand` | Mapping an unfamiliar repository, architecture, dependencies, or impact before deciding what to change. |
| `showdar-requirements` | Product or business input needs explicit behavior, rules, acceptance criteria, assumptions, or open decisions. |
| `showdar-plan` | Agreed behavior needs a bounded implementation plan, change surface, task order, risks, or verification steps. |

### Engineering

| Skill | Use when |
| --- | --- |
| `showdar-design` | Product UI needs design direction, UX decisions, responsive layout, accessibility, or visual polish. |
| `showdar-build` | Implementing or refactoring an agreed application change within existing architecture and contracts. |
| `showdar-debug` | Observed behavior fails through crashes, regressions, build failures, races, networking, memory, or performance issues. |
| `showdar-upgrade` | Upgrading dependencies, frameworks, runtimes, or native platforms where compatibility or rollback risk matters. |

### Quality

| Skill | Use when |
| --- | --- |
| `showdar-test` | Choosing or implementing automated tests for behavior, regressions, integration, E2E, or coverage. |
| `showdar-quality` | Planning QA/QC scenarios, risk coverage, regression scope, compatibility checks, or bug-report evidence. |
| `showdar-review` | Reviewing code or diffs for general correctness, architecture, performance, maintainability, or tests. |

### Security and operations

| Skill | Use when |
| --- | --- |
| `showdar-security` | Assessing threat models, attack surfaces, trust boundaries, auth/authz, secrets, exposure, or exploitability. |
| `showdar-ops` | Inspecting or changing CI/CD, containers, environments, deployment, observability, rollback, or runtime operations. |

### Delivery and recovery

| Skill | Use when |
| --- | --- |
| `showdar-ship` | Checking whether a change, artifact, or release is ready for handoff or external release. |
| `showdar-recover` | Interrupted or partial engineering work must be reconstructed from repository evidence before continuing. |
| `showdar-git` | Performing local Git inspection, staging, commits, branch integration, conflicts, cleanup, or explicitly requested remote Git actions. |

## A typical software workflow

```text
Requirements
     |
     v
Plan -----> Design
     |
     v
Build ----> Debug / Test / Quality
     |
     v
Review ---> Security
     |
     v
Ship readiness -----> Ops
     |
     v
Git completion
```

This is a mental model, not a mandatory pipeline. Choose the skill that matches
the current intent.

## Usage examples

Codex discovers installed skills from natural requests or explicit names:

```text
$showdar-requirements review this ticket for missing rules
$showdar-debug find the root cause of this crash
$showdar-quality create regression scenarios
$showdar-security threat model this auth flow
$showdar-ops inspect the deployment setup
$showdar-git commit only the current task changes
```

OpenCode exposes native commands after initialization with `--ai opencode` or
`--ai all`:

```text
/showdar/requirements review this ticket for missing rules
/showdar/debug find the root cause of this crash
/showdar/security threat model this auth flow
/showdar/ops inspect the deployment setup
/showdar/git commit only the current task changes
```

## Safety boundaries

| Skill | Boundary |
| --- | --- |
| `showdar-ship` | Verifies readiness; it does not deploy or create CI/CD by default. |
| `showdar-ops` | Handles operational work; remote or production mutation requires explicit intent, target, and authorization. |
| `showdar-git` | Does not imply push, force-push, or destructive cleanup. |
| `showdar-security` | Performs defensive, evidence-based analysis and never exposes secret values. |
| `showdar-requirements` | Records assumptions and open decisions instead of inventing business decisions. |

## CLI reference

```bash
showdar init [--scope <project|global>] --ai <target> --profile <profile>
showdar list
showdar status [--scope <project|global>]
showdar doctor [--scope <project|global>]
showdar validate
showdar remove [--scope <project|global>]
```

Main flags are `--ai`, `--profile`, and `--scope`. `--ai` accepts `codex`,
`opencode`, `claude`, `universal`, or `all`. `--scope` defaults to `project`;
`--profile` accepts the six canonical profiles and the `mobile`/`web` aliases.
Run `showdar --help` or a command's `--help` for current options.

`showdar validate` validates the installed Showdar package. `showdar doctor`
checks managed files against ownership hashes, while `showdar remove` removes
only those managed paths and preserves unrelated files.

## Updating and refreshing

There is no separate `showdar update` command:

```bash
# Upgrade the CLI from npm
npm install -g showdar-skills@latest

# Refresh Showdar-owned skills in the selected scope
showdar init --scope project --ai codex --profile developer
```

For source development, reinstall from the checkout with `npm install -g .`.
Re-running `showdar init` is idempotent and refreshes managed files. Use
`showdar remove` for project scope or `showdar remove --scope global` for the
user installation.

## Maintainer release guide

Release and Trusted Publishing instructions live in the
[maintainer release guide](https://github.com/caongocquy/showdar-skills/blob/main/RELEASING.md).

## Development

```bash
npm test
npm run validate
npm run check
npm run smoke
npm run eval
npm pack --dry-run
```

Showdar is dependency-light and uses Node.js built-ins for its CLI, validator,
search engine, installer, and tests. Supporting knowledge remains in each
skill's `data/`, `references/`, `scripts/`, `stacks/`, and `examples/`
directories so the selected workflow can load it progressively.

## License

[MIT](./LICENSE)
