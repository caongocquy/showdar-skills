# Showdar Skills

[![Node >=20](https://img.shields.io/badge/node-%3E%3D20-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![MIT License](https://img.shields.io/badge/license-MIT-blue?logo=opensourceinitiative&logoColor=white)](./LICENSE)
[![15 skills](https://img.shields.io/badge/skills-15-6f42c1)](#skill-catalog)

Production-grade software engineering skills for coding agents. Showdar covers
requirements, planning, design, implementation, debugging, QA, security,
operations, release readiness, and Git workflows with lightweight intent
routing and progressive knowledge loading.

> npm publication: prepared for the first release; `showdar-skills@0.2.0` is
> not published yet.

## Quick start

After the first npm publication, install the CLI globally and add project
skills explicitly:

```bash
npm install -g showdar-skills
cd my-project
showdar init --ai codex --profile developer
showdar doctor
```

The current source-install alternative is:

```bash
git clone https://github.com/caongocquy/showdar-skills.git
cd showdar-skills
npm install -g .
```

CLI installation and skill installation are separate. Installing the CLI
globally does not install skills globally; `showdar init` controls the project
or user scope where skills are copied.

## Why Showdar?

- 15 focused skills for the software lifecycle, instead of one oversized prompt.
- Native discovery for Codex, OpenCode, and Claude Code.
- Evidence-first workflows with bounded safety and verification contracts.
- Searchable data, references, scripts, stack guidance, and examples loaded only
  when the selected task needs them.

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
help the agent choose a skill, then that skill loads its workflow and deeper
knowledge progressively.

## Supported agents and destinations

| Agent target | Project scope | Global scope |
| --- | --- | --- |
| Codex | `.agents/skills/` | `~/.agents/skills/` |
| Universal | `.agents/skills/` | `~/.agents/skills/` |
| OpenCode | `.opencode/skills/` + `.opencode/commands/showdar/` | `~/.config/opencode/skills/` + `~/.config/opencode/commands/showdar/` |
| Claude Code | `.claude/skills/` | `~/.claude/skills/` |

Codex and Universal intentionally share `.agents/skills/`; `--ai all` avoids
duplicating that physical destination. OpenCode receives both skills and
native `/showdar/...` command files.

### Project and global installation

Project scope is the default and writes to the current project:

```bash
cd my-project
showdar init --scope project --ai codex --profile developer
showdar status
showdar doctor
```

Global scope does not require a Git repository:

```bash
showdar init --scope global --ai codex --profile developer
showdar status --scope global
showdar doctor --scope global
```

Global CLI installation is not global skill installation. Project ownership is
stored in `.showdar.json`; global ownership is stored in `~/.showdar/global.json`.
Only Showdar-owned paths are refreshed or removed.

## Profiles

Choose a role-specific profile for more precise discovery, or use `full` when
all capabilities are useful. `full` exposes all 15 skills but still does not
eagerly load all skill bodies.

| Profile | Skills |
| --- | ---: |
| `minimal` | 8 |
| `developer` | 12 |
| `backend` | 14 |
| `qa` | 9 |
| `product` | 6 |
| `full` | 15 |

Legacy aliases remain compatible:

```text
mobile -> developer
web    -> developer
```

New manifests store the canonical `developer` profile.

## Skill catalog

All 15 entries remain first-class Showdar skills.

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

## Typical software workflow

```text
Requirements
    |
    v
Plan
    |
    +--> Design
    |
    v
Build
    |
    +--> Debug
    +--> Test
    |
    v
Quality
    |
    v
Review / Security
    |
    v
Ship readiness
    |
    +--> Ops
    |
    v
Git completion
```

This is a composition guide, not a mandatory sequence. Choose the skill that
matches the current intent.

## Usage examples

Codex discovers installed native skills from natural requests or explicit names:

```text
$showdar-requirements review this ticket for missing rules
$showdar-plan plan the implementation
$showdar-debug find the root cause of this crash
$showdar-quality create regression scenarios
$showdar-security threat model this auth flow
$showdar-ops inspect the deployment setup
$showdar-git commit only the current task changes
```

OpenCode uses native commands when initialized with `--ai opencode` or
`--ai all`:

```text
/showdar/requirements review this ticket for missing rules
/showdar/debug find the root cause of this crash
/showdar/security threat model this auth flow
/showdar/ops inspect the deployment setup
/showdar/git commit only the current task changes
```

## Safety boundaries

- `showdar-ship` verifies readiness; it does not automatically deploy or create
  CI/CD.
- `showdar-ops` performs operational work when requested. Remote or production
  mutation requires explicit intent, target, and authorization.
- `showdar-git` preserves unrelated work and does not imply push, force-push, or
  destructive cleanup.
- `showdar-security` performs defensive, evidence-based analysis and never
  exposes secret values.
- `showdar-requirements` records assumptions and open decisions instead of
  inventing stakeholder or business choices.

## CLI reference

```bash
showdar init [--scope <project|global>] --ai <target> --profile <profile>
showdar list
showdar status [--scope <project|global>]
showdar doctor [--scope <project|global>]
showdar validate
showdar remove [--scope <project|global>]
```

`--ai` accepts `codex`, `opencode`, `claude`, `universal`, or `all`.
`--scope` defaults to `project`; `--profile` accepts the six canonical profiles
and the `mobile`/`web` aliases. Run `showdar --help` or a command's `--help`
for the current options.

`showdar validate` validates the installed Showdar package, not the target
application. `showdar doctor` checks managed files against ownership hashes;
`showdar remove` removes only those managed paths and preserves unrelated files.

## Refreshing skills

There is no separate `showdar update` command. Reinstall the CLI, then rerun
`showdar init` with the same scope, target, and profile:

```bash
# Future npm install
npm install -g showdar-skills@latest

# Source development
npm install -g .

showdar init --scope project --ai codex --profile developer
```

Initialization is idempotent and refreshes Showdar-owned files. Use
`showdar remove` for project scope or `showdar remove --scope global` for the
user installation.

## Maintainer release notes

The first release is manual because the package does not exist on npm yet:

```bash
npm pack
npm publish ./showdar-skills-0.2.0.tgz
```

After the package exists, configure npm Trusted Publishing for the
`caongocquy/showdar-skills` GitHub Actions workflow named `publish.yml`. The
workflow runs only for `v*` tags, verifies the tag/package version, uses OIDC
with provenance, and contains no npm token. It skips an already-published
version and fails on registry errors other than a real E404. Trusted
Publishing is not configured yet. The repository's `RELEASING.md` contains
the maintainer runbook.

## Development

```bash
npm test
npm run validate
npm run check
npm run smoke
npm run eval
npm pack --dry-run
```

Showdar stays dependency-light and uses Node.js built-ins for its CLI,
validator, search engine, installer, and tests. Supporting knowledge remains
in each skill's `data/`, `references/`, `scripts/`, `stacks/`, and `examples/`
directories so the selected workflow can load it progressively.

## License

MIT
