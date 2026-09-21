# Showdar Skills

[![npm version](https://img.shields.io/npm/v/showdar-skills?logo=npm)](https://www.npmjs.com/package/showdar-skills)
[![Node >=20](https://img.shields.io/badge/node-%3E%3D20-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![MIT License](https://img.shields.io/badge/license-MIT-blue?logo=opensourceinitiative&logoColor=white)](./LICENSE)
[![19 skills](https://img.shields.io/badge/skills-19-6f42c1)](#skill-catalog)

Production-grade software engineering skills for coding agents. Showdar covers
the full lifecycle—from requirements and planning through implementation, QA,
security, operations, release readiness, and Git—with lightweight intent
routing and progressive knowledge loading.

## Quick start

Install the CLI, then install a role-oriented skill profile into your project:

```bash
npm install -g showdar-skills
cd my-project
showdar init
showdar doctor
```

```bash
showdar init --ai cursor
showdar init --ai claude --scope global
showdar init --profile developer --ai opencode
```

To install from source instead:

```bash
git clone https://github.com/caongocquy/showdar-skills.git
cd showdar-skills
npm install -g .
```

Showdar works with Universal Agent Skills, Codex, OpenCode, Cursor, and
Claude Code as supported installation targets. Choose `backend`, `qa`, or
`product` when that gives discovery a more precise context; use `full` when
you want all capabilities available.

## Why Showdar?

- **15 focused primitive skills** plus 4 adaptive workflow skills (19 installable) instead of one oversized agent prompt.
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

The 15 primitive skills are not eagerly loaded as full prompts. Lightweight
descriptions help the agent choose one skill; that skill then loads its
workflow and deeper knowledge progressively. Workflow skills add a portable
orchestration layer: a workflow selects the lifecycle stages a task actually
needs and composes primitives one at a time, without duplicating their
instructions.

## Supported agents

| Harness | Project path | Global path | Status |
| --- | --- | --- | --- |
| Universal Agent Skills | `.agents/skills/` | `~/.agents/skills/` | Supported installation target |
| Codex | `.agents/skills/` | `~/.agents/skills/` | Supported installation target |
| OpenCode | `.opencode/skills/` | `~/.config/opencode/skills/` | Supported installation target |
| Cursor | `.cursor/skills/` | `~/.cursor/skills/` | Supported installation target |
| Claude Code | `.claude/skills/` | `~/.claude/skills/` | Supported installation target |

"Supported installation target" means skills install to the harness-native
directory. It does not promise identical implicit invocation, cloud,
agent/subagent, or MCP behavior across harnesses.

## Adapter model

The portable core (15 primitives + 4 workflows) never changes per harness.
A thin native adapter layer renders harness-specific entry surfaces only:

```text
portable Showdar semantics
  -> canonical renderers
  -> harness adapter
  -> native instruction/command surface
```

Adapters do NOT change routing, grant authority, rewrite `SKILL.md`
semantics, or fork workflows per harness.

## Native instruction surfaces (project scope)

| Target | Instruction surface |
| --- | --- |
| `universal` | `AGENTS.md` managed block |
| `codex` | `AGENTS.md` managed block |
| `opencode` | `AGENTS.md` managed block |
| `claude` | `CLAUDE.md` managed block |
| `cursor` | `.cursor/rules/showdar.mdc` |

One native instruction surface per explicit target. The Cursor rule uses
Apply Intelligently metadata (`alwaysApply: false`, no globs) and carries
the same canonical semantic body as the `AGENTS.md`/`CLAUDE.md` blocks.

## Native command surfaces

| Target | Commands |
| --- | --- |
| `opencode` | Native `/showdar/<skill>` |
| `claude` | Native `/showdar/<skill>` |
| `codex` | None (skill invocation only) |
| `cursor` | None (rule discovery only) |
| `universal` | None (skill discovery only) |

`/showdar/skill` is generated for OpenCode/Claude as generic
installed-skill discovery. Commands are generated dynamically from the
installed skill set: `minimal` yields 8 direct commands plus the generic
entry; adding `feature` yields 9 plus generic. All 19 commands never exist
unless all 19 skills are installed.

## Native install examples

```bash
showdar init --ai opencode
showdar init --ai claude
showdar init --ai cursor
showdar add feature --ai claude
showdar add debug --ai opencode
```

OpenCode project install produces `.opencode/skills/...`,
`.opencode/commands/showdar/...`, and the `AGENTS.md` managed block.
Claude produces `.claude/skills/...`, `.claude/commands/showdar/...`, and
the `CLAUDE.md` managed block. Cursor produces `.cursor/skills/...` and
`.cursor/rules/showdar.mdc` with no generated commands.

## `--ai all` compatibility policy

`--ai all` is a compatibility aggregate. It installs all native skill
roots, generates OpenCode and Claude commands, and writes only the
canonical `AGENTS.md` instruction block. It does NOT generate the
`CLAUDE.md` Showdar block or the Cursor rule, avoiding duplicate Showdar
instruction ingestion across compatibility-aware hosts. For native-optimal
Claude/Cursor behavior use explicit `--ai claude` or `--ai cursor`.

## Global scope

Global installs provide skills everywhere and OpenCode/Claude commands
where applicable, with no managed global instruction files. This is
deliberate in 0.5.0:

| Global target | Contents |
| --- | --- |
| `universal` | skills only |
| `codex` | skills only |
| `opencode` | skills + commands |
| `claude` | skills + commands |
| `cursor` | skills only |
| `all` | all skill roots + OpenCode/Claude commands |

No global `AGENTS.md`, `CLAUDE.md`, or Cursor rule is managed.

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

Role-specific profiles improve routing precision. Profiles install primitive
skill sets; workflow skills are opt-in through `showdar add <workflow>` and
are not silently included in any profile. `full` exposes every primitive
skill, but still does not eagerly load every skill body.

| Profile | Skills | Best for |
| --- | ---: | --- |
| `minimal` | 8 | Focused everyday assistance |
| `developer` | 12 | General application development |
| `backend` | 14 | APIs, services, and runtime operations |
| `qa` | 9 | Testing and quality workflows |
| `product` | 6 | Product, requirements, and design work |
| `full` | 15 | All primitive capabilities |

Legacy aliases remain compatible:

```text
mobile -> developer
web    -> developer
```

New manifests store the canonical `developer` profile.

## Skill catalog

All 15 primitive entries are first-class Showdar skills. Four workflow skills
compose them; see [Workflow skills](#workflow-skills).

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

## Workflow skills

Four workflow skills orchestrate primitives adaptively; they are not fixed
pipelines and they grant no extra authority:

| Skill | Use when |
| --- | --- |
| `showdar-feature` | Implementing a complete feature end-to-end. |
| `showdar-bugfix` | Resolving an observed defect end-to-end. |
| `showdar-release` | Preparing, validating, or executing a release lifecycle. |
| `showdar-incident` | Investigating or recovering from an active operational incident. |

How a workflow runs:

```text
Workflow
  -> selects needed lifecycle stages
  -> invokes/composes primitive skills one at a time
  -> primitives retain their own semantics
  -> Phase 6G remains the authority source
```

Properties:

- Adaptive, not fixed pipelines: stages marked `?` below are skipped when
  evidence permits.
- Intended for whole-task and lifecycle requests.
- Focused primitive requests remain primitive.
- Workflow identity never grants mutation or deployment authority.
- Risk and severity never grant production authority.
- Workflows do not create a second router or authority engine.

### showdar-feature

```bash
showdar add feature
```

Typical candidate flow:

```text
understand -> requirements? -> plan? -> design? -> build -> test -> review
```

Skip requirements when behavior is already defined, plan for genuinely
focused work, and design when no architecture or UX decision exists.
Verification is never skipped to move faster. Ops is not implied.

### showdar-bugfix

```bash
showdar add bugfix
```

Typical:

```text
understand -> debug? -> build -> test -> review
```

If the root cause is already proven, debug may be skipped. If the request is
diagnosis only, build is not implied and the workflow stops after
`showdar-debug`.

### showdar-release

```bash
showdar add release --scope global --ai claude
```

Typical:

```text
quality -> security? -> ship -> ops only with explicit target + authorization
```

Readiness must not imply deployment. `showdar-ship` stays delivery
verification; `showdar-ops` loads only with an explicit target plus execution
authorization.

### showdar-incident

```bash
showdar add incident
```

Typical:

```text
understand -> debug -> recover -> verification -> ops only when explicitly authorized
```

Diagnose before mutating when the cause is unknown. Severity must not imply
production mutation. The workflow never auto-deploys or restarts production
from risk alone.

Workflows compose primitives: they select only the stages the evidence
requires, skip defined or decision-free stages, load one primitive at a time,
and stop when evidence or authority is missing. Single primitive requests stay
primitive (`showdar-review`, `showdar-debug`, `showdar-test`). Phase 6G remains
the authority source; workflows consume it and never mint it. Workflows are
opt-in through `showdar add <workflow>`; profiles install primitive sets only.

## Workflow execution state (0.6.0)

```text
portable workflow
  -> workflow-state
  -> primitive evidence/stop conditions
  -> current Phase 6G resolution
  -> next stage / blocked / complete
```

Workflow state (`src/workflow-state.js`, schemaVersion 1) is a portable,
versioned JSON checkpoint: `workflowId`, selected stages, active stage,
completed stages, skipped stages, evidence receipts, blockers, next stage,
`status` (`NEW`/`READY`/`ACTIVE`/`COMPLETE`/`INTERRUPTED`/`BLOCKED`), and a
deterministic monotonic `revision` counter. Timestamps
(`createdAt`/`updatedAt`/receipt timestamps) are metadata and provenance only.

Workflow state is NOT authority, memory, router intent, or a persistence
backend. It never persists authority-derived fields
(`primaryCapability`, `authorizedAction`, `mutationPermission`,
`routeAuthority` or equivalents). Checkpoint JSON may be stored by a
caller or harness anywhere; Showdar 0.6 does not choose or manage storage.

Evidence receipts are compact copies of primitive evidence at stage
completion (`kind`, `quality`, `source`, `detail`, timestamp, optional
provenance). Quality follows `claimed < observed < verified`; `failed` and
`missing` remain meaningful negative states. High-sensitivity evidence
(change, tests, build, package, compatibility, regression proof, release
readiness) may require re-verification after resume; old evidence is not
permanently valid.

Safe resume is always:

```text
checkpoint
  -> deserialize + validate
  -> resolve current request/context through Phase 6G
  -> compatibility/freshness checks
  -> READY or BLOCKED + replanRequired
```

A checkpoint alone can never authorize continuation. Previously authorized
mutation is never restored from a checkpoint. When the current Phase 6G
resolution no longer matches the checkpoint, resume returns `BLOCKED` with
`replanRequired` instead of silently continuing.

Per-workflow skip policy (evidence-backed, never severity or wording alone):

- Feature: requirements/plan/design may be skipped only with policy-backed
  evidence; build, test, and review always run.
- Bugfix: debug may be skipped only with verified root-cause evidence;
  symptom description alone is insufficient; investigation-only requests stop
  without mutation.
- Release: readiness does not imply deployment; ops loads only with explicit
  target plus execution authorization.
- Incident: severity never grants production mutation; recovery and
  verification remain gated by current authority.

### Workflow traces (observability, benchmark-only)

Workflow traces are pure projections of before/after workflow states
(`src/workflow-trace.js`): ordered events such as `stage-entered`,
`stage-completed`, `stage-skipped`, `workflow-blocked`, `workflow-resumed`,
and `workflow-completed`. Traces carry stage IDs, skip reasons, receipt
summaries, and statuses only — no timestamps, no prompts, no secrets, no
authority content. Nothing persists them automatically; the benchmark
corpus (`npm run eval:workflows`) uses them to verify selection, skip,
resume, and completion behavior deterministically.

A workflow trace does not mutate workflow state, affect routing or
authority, persist automatically, or send telemetry. The 10 event
categories are `workflow-created`, `stages-selected`, `stage-entered`,
`evidence-recorded`, `stage-completed`, `stage-skipped`,
`workflow-blocked`, `workflow-interrupted`, `workflow-resumed`, and
`workflow-completed`.

### Evaluation

```bash
npm run eval:retrieval  # retrieval evaluation (unchanged behavior)
npm run eval:workflows  # deterministic workflow semantic benchmark
npm run eval            # both, sequentially (release-blocking)
```

Workflow evaluation asserts exact M1–M10 invariants (selection accuracy,
invalid-skip rejection, verification preservation, stale-resume blocking,
authority invariance, completion, trace equality, revision monotonicity,
checkpoint round-trip, skip-evidence backing) with no fuzzy score
thresholds. `npm run check` (test/validate/pack) does not run the
benchmark; the release pipeline runs `npm run eval`, gating both suites.

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

## Adding a single skill

Install one skill without re-running a whole profile:

```bash
showdar add debug
showdar add showdar-security
showdar add test --ai cursor
showdar add review --scope global --ai claude
showdar add feature
showdar add bugfix --ai cursor
showdar add release --scope global --ai claude
showdar add incident
```

Accepted names are the short form (`debug`, `feature`) or the canonical form
(`showdar-debug`, `showdar-feature`). The release ships exactly 15 primitive
skills plus 4 workflow skills (19 installable total); profiles install
primitive sets only. There is no `showdar workflow ...` command. `showdar add`
is idempotent, preserves the configured profile, supports `--ai`/`--scope`
overrides, and refuses to overwrite a foreign same-name skill directory that
Showdar does not own.

## Routing

Showdar routes each request through progressive disclosure: the host discovers
lightweight skill metadata, loads the relevant skill, and pulls deeper
guides and data only when needed.

```text
current request
      |
      v
structural interpretation
      |
      v
authority classification
      |
      v
primary capability
      |
      v
skill
```

Product behavior notes:

- Context, log, and example text does not automatically become requested work.
- Conditional and hypothetical actions remain non-authoritative until current
  request semantics permit them.
- Risk metadata does not override an explicit governing action.

## CLI reference

```bash
showdar init [--scope <project|global>] --ai <target> --profile <profile>
showdar add <skill> [--ai <target>] [--scope <project|global>]
showdar list
showdar status [--scope <project|global>]
showdar doctor [--scope <project|global>]
showdar validate
showdar remove [--scope <project|global>]
```

Main flags are `--ai`, `--profile`, and `--scope`. `--ai` accepts `universal`,
`codex`, `opencode`, `cursor`, `claude`, or `all` for `init` (single targets
for `add`). `--scope` accepts `project` or `global` and defaults to `project`;
`--profile` accepts the six canonical profiles and the deprecated
`mobile`/`web` aliases. Run `showdar --help` or a command's `--help` for
current options.

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
