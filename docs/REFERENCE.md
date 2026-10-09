> **Historical reference:** This document contains older CLI descriptions. Current commands: `showdar setup` is the interactive skills installer (formerly `showdar wizard`); `/showdar-setup` is the agent-driven project-context audit on OpenCode/Claude. See [README](../README.md) for the current quick start.

# Showdar Skills

[![npm version](https://img.shields.io/npm/v/showdar-skills?logo=npm)](https://www.npmjs.com/package/showdar-skills)
[![Node >=20](https://img.shields.io/badge/node-%3E%3D20-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![MIT License](https://img.shields.io/badge/license-MIT-blue?logo=opensourceinitiative&logoColor=white)](./LICENSE)
[![22 skills](https://img.shields.io/badge/skills-22-6f42c1)](#skill-catalog)

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

## Additive installation

`showdar init --profile <name>` **replaces** the Showdar-owned skill selection.
`showdar add` always **preserves** existing skills and the selected base profile:

```bash
showdar init --profile developer --ai opencode
showdar add git                         # same as showdar add showdar-git
showdar add profile insurance           # union, no deletions
showdar add workflow feature            # workflow + missing primitive stages
showdar add workflow ./acme-release.json # standalone custom workflow, project scope
```

Both `showdar add feature` and `showdar add showdar-feature` are aliases for
`showdar add workflow feature`, including automatic installation of missing
primitive stage skills. All built-in profiles are additive via `add profile`;
`init` remains the explicit replace operation. Existing workflow packs and
custom workflow definitions are preserved when adding skills. The runtime
router is included in the Showdar CLI and is automatically referenced by
updated native guidance; it does not require an additional skill.

Built-in workflow dependency installation does **not** execute the workflow,
authorize source mutation, commit, merge or push. A custom workflow JSON file
uses the existing `add-workflow` validation/manifest semantics; remote files
and arbitrary executable plugins are unsupported.

## Interactive terminal experience

On a real terminal, `showdar wizard` and `showdar add --interactive` open a
keyboard-driven TUI powered by `@clack/prompts`. Use **↑/↓ + Enter** for single
choices and **Space + Enter** for multi-selection. The skill picker also supports
typing to search. The wizard presents a full preview and waits for confirmation
before installing. Ctrl+C or declining confirmation cancels with no changes.

`showdar setup` uses the same guided prompts and previews documents before
writing. For scripts/CI, `--yes`, `--dry-run` and `--json` remain unchanged
and never require a TTY.

## Guided onboarding and project context

Showdar also offers repo-aware onboarding after installing the CLI and selected
skills. It detects Git host, package scripts, stack and documentation, then
previews the files it would create:

```bash
showdar setup --dry-run --json
showdar setup                       # interactive terminal questionnaire
showdar setup --yes --tracker gitlab # non-interactive, requires safe task branch
```

Run `showdar guard --mutation local-write --json` before applying setup changes.
On an integration branch, use `showdar git-start` first. Setup never writes
code or silently overwrites existing user docs. It creates only missing
`docs/agents/project.md`, `issue-tracker.md`, `verification.md`, and
`domain.md`. A glossary and ADRs are referenced if present, not created
unnecessarily. Installed native guidance asks skills to consult relevant
shared context when it exists. OpenCode/Claude expose `/showdar/setup`;
other agents can run `showdar setup` from their terminal.

The installer also has an interactive selector:

```bash
showdar wizard
showdar add --interactive                 # additive wizard alias
showdar wizard --profile developer --skills git,insurance-domain --workflow feature --ai opencode --dry-run
showdar wizard --profile developer --skills git --ai opencode --yes
showdar wizard --mode replace --profile insurance --ai codex --yes
```

The wizard chooses install mode (add or replace), profile, additional skills,
built-in workflows, AI target, and scope. It previews the deduplicated skill
set and confirms before changing files. Non-interactive executions require
explicit skill selection and `--yes`, unless using `--dry-run`. The default
mode is additive, preserving the current installation; replace mode uses
the same semantics as `showdar init`. No downloads or remote writes occur.

## Runtime routing and task branches

```bash
printf '%s\n' 'Implement the approved underwriting form and add tests' | showdar route --stdin --json
showdar route --prompt "Explain insurance terminology"
showdar git-start --dry-run --type feature --name "IDP-123 Add pricing form"
showdar git-start --type feature --name "IDP-123 Add pricing form"
showdar guard --mutation local-write --json
```

Prefer `--stdin` for arbitrary or multiline prompts. Supply stdin as literal data;
never interpolate request text into a shell command. Both commands support `--json`
with a schemaVersion 1 envelope (`command`, `ok`, `data`, `warnings`, `errors`).

`route` is read-only. It consumes the existing Phase 6G authority resolver and thin
route, projecting exactly the seven public Intent keys plus lifecycle primary and
advisors. It never exposes internal capabilities, frames or authority diagnostics.
It neither authorizes work nor creates a branch. It preserves canonical advisor
semantics: a security-review phrase is not guaranteed to become a security advisor.

Domain discovery is a separate advisory overlay using the canonical
`router/skill-map.yaml` inline trigger arrays and grouped domain catalog metadata.
It uses deterministic Unicode phrase matching, not lifecycle scoring. Insurance
terminology can recommend `showdar-insurance-domain`, underwriting/rating business
flows `showdar-insurance-workflows`, and insurer API/UI terminology review
`showdar-insurance-review`. These skills do not replace lifecycle primaryCapability,
rewrite Intent/mutation, or grant authority. The existing ASCII/token ranking
helper is unsuitable for Vietnamese phrase discovery. No duplicate trigger table
or second authority engine is introduced.

When `.showdar.json` exists, availability checks managed native skill files and
recorded, still-present globally satisfied skills. Missing lifecycle primary,
advisors and domain matches are reported separately with `showdar add <name>`
suggestions; another installed skill never substitutes for the canonical route.
Without a project manifest, `managed` is false and installed/missing fields are
null (unknown), not fabricated. Invalid manifests fail explicitly. Explicit named
installed skills may load directly; this adds no mutation authority.

Managed project guidance invokes `showdar route --stdin --json` for automatic
selection, then loads the installed lifecycle skill, domain overlays and advisors.
The runtime bridge requires the `showdar` CLI in the harness environment. If it is
unavailable, native skill descriptions/static discovery are the fallback. No npm
install, npx fetch, package dependency mutation or remote download happens.
Projects receive only existing skills/commands/instructions/manifest; no wholesale
`src/`, `engine/` or `router/` copy. Init and add regenerate complete installed-set
guidance, including re-adding an existing skill. Global installs keep native discovery
and do not write project AGENTS.md or CLAUDE.md.

The four workflows remain native discoverable/installable skills; `route` does not
introduce workflow selection. Profiles contain primitives plus portable companions: `full` contains all
18 primitives and 4 companions; the insurance profile remains unchanged.

Before the first local-write task source edit, the coding agent must run
`showdar guard --mutation local-write --json` and require `ok=true` and
`data.allowed=true`. When on develop/main/integration, it must execute
`showdar git-start` (not only suggest it), confirm the branch, and rerun guard.
This is an instruction-level agent preflight, **not an OS/filesystem hook**:
tools that ignore Showdar can still write files. Cursor's generated rule now
uses `alwaysApply: true` so the Git preflight isn't limited to manually
activated skill calls. Existing project guidance must be refreshed after the
package update (for example by running `showdar add git` with the new CLI).
Re-adding an installed skill refreshes its managed SKILL.md and guidance only
if the owned copy has not been locally modified; drift refuses to overwrite.

Before the first local-write task source edit on develop/development/dev/main/master
or the repository default/integration branch, prepare a task branch. Priority is
repository instructions/documented convention, explicit current user instruction,
clearly detected convention, then Showdar defaults. Explicit trunk/direct-work policy
wins. One coherent task uses one branch across plan/build/test/review. Completion
means verify and report; commit, merge and push need their own authority.

`git-start` prepares local branch state only. Types: feature (new capability), fix
(defect), refactor (internal structure), test, docs, chore (tooling/config), release,
hotfix (explicit urgent production repair). Slugs are lowercase, hyphenated, ticket
preserving and bounded; task text is passed as data and never executed.

Base resolution uses explicit `--base`, repository-local `showdar.gitBase`, established
local develop/development/dev, then local default/main/master. The helper does not
parse prose instructions or create develop. Read policy first and supply its base
when convention differs. Local Git config `showdar.gitBranchPrefix` supports custom
prefixes; `showdar.gitDirectWork=true` records an explicit direct-work convention.
Hotfix requires a convention via `--base` or `showdar.gitBase`.

Dry-run validates Git state/type/slug/base/collision and changes no refs. Execution
revalidates, then creates/switches only a task branch. Already on the matching branch
is a no-op; another task branch is blocked. An existing target is reused automatically
only when its tip equals both current HEAD and base; divergent/ambiguous targets stop
without overwriting history. Detached HEAD and active Git operations stop.

Dirty worktrees are blocked before any switch: the helper cannot prove ownership.
Confirmed current-task-only changes may use equivalent repository-specific branch
preparation after explicit ownership inspection. No automatic stash/reset/restore/clean,
staging, commit, merge or push occurs. Branch preparation itself does not authorize
source edits.

## Why Showdar?

- **18 focused primitive skills**, 4 portable companions and 4 adaptive workflow skills (26 installable), including an opt-in insurance domain profile.
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

The 18 primitive skills are not eagerly loaded as full prompts. Lightweight
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

The portable core (18 primitives + 4 workflows) never changes per harness.
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
entry; adding `feature` yields 9 plus generic. All 22 commands never exist
unless all 22 skills are installed.

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

Role-specific profiles improve routing precision. Profiles install selected primitive
and portable companion skills; workflows remain opt-in through `showdar add <workflow>`.
`full` includes every primitive and companion, but does not eagerly load every skill body.

| Profile | Skills | Best for |
| --- | ---: | --- |
| `minimal` | 8 | Focused everyday assistance |
| `developer` | 16 | General application development |
| `backend` | 18 | APIs, services, and runtime operations |
| `qa` | 13 | Testing and quality workflows |
| `product` | 9 | Product, requirements, and design work |
| `insurance` | 3 | Insurance terminology, business flows, and UI/API review |
| `full` | 22 | All primitive and companion capabilities |

Legacy aliases remain compatible:

```text
mobile -> developer
web    -> developer
```

New manifests store the canonical `developer` profile.

## Test-driven implementation and document layout

The `showdar-tdd` companion is included in developer/backend/qa/full profiles, or can be installed individually with `showdar add tdd --ai cursor`. It runs one scoped RED (reproduced behavior failure), GREEN (passing focused test), REFACTOR (focused test stays passing) cycle at a time and hands actual proof to `showdar-build`. `showdar-test` independently selects integration, regression and E2E coverage; Review remains a separate quality gate. No fabricated RED logs and no ceremonial tests for documentation-only or missing-harness work.

Adaptive documentation persistence uses a project's existing canonical docs first; if none exists, durable approved specs default to `docs/showdar/specs/<feature>.md` and multi-session execution plans default to `docs/showdar/plans/<feature>.md`. Smaller tasks can remain in chat. A saved plan is not execution authorization and task checkboxes require fresh code/test evidence.

```text
docs/showdar/
  specs/<feature>.md
  plans/<feature>.md
```

## Skill catalog

All 18 primitive entries and 4 portable companions are installable Showdar skills.
Four workflow skills compose the primitive stages; see [Workflow skills](#workflow-skills).
`showdar-tdd` is a companion used inside the Build stage when suitable; it does not change the workflow-state stage list.

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
| `showdar-tdd` (companion) | Implementing a bounded behavioral change with real RED → GREEN → REFACTOR evidence; direct invocation `/showdar-tdd` is available where native skills support it. |
| `showdar-quality` | Planning QA/QC scenarios, risk coverage, regression scope, compatibility checks, or bug-report evidence. |
| `showdar-review` | Reviewing code or diffs for general correctness, architecture, performance, maintainability, or tests. |

### Security and operations

| Skill | Use when |
| --- | --- |
| `showdar-security` | Assessing threat models, attack surfaces, trust boundaries, auth/authz, secrets, exposure, or exploitability. |
| `showdar-ops` | Inspecting or changing CI/CD, containers, environments, deployment, observability, rollback, or runtime operations. |

### Insurance

| Skill | Use when |
| --- | --- |
| `showdar-insurance-domain` | Vietnamese insurer terminology, product taxonomy, coverage concepts, and VI/EN glossary. |
| `showdar-insurance-workflows` | Product configuration, underwriting, pricing, policy lifecycle, collection, or claims flows. |
| `showdar-insurance-review` | Reviewing insurer UI, domain/API mappings, validations, and QA scenarios. |

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
showdar add insurance-domain
showdar add insurance-workflows
showdar add insurance-review
showdar init --profile insurance
```

After a Showdar Skills release containing these entries is published, upgrade the CLI
and add one insurance skill at a time from the insurer project:

```bash
npm install -g showdar-skills@latest
showdar add insurance-domain --ai codex
```

Use `showdar add insurance-workflows --ai codex` and
`showdar add insurance-review --ai codex` when those are needed. For a new project
that wants all three, `showdar init --profile insurance --ai codex` installs the set.

Accepted names are the short form (`debug`, `feature`, `insurance-domain`)
or the canonical form (`showdar-debug`, `showdar-feature`). The release ships exactly 18 primitive,
4 companion and 4 workflow skills (26 installable total); built-in profiles select primitive
and companion skills but do not include workflows. There is no `showdar workflow ...` command. `showdar add`
is idempotent, preserves the configured profile, supports `--ai`/`--scope`
overrides, and refuses to overwrite a foreign same-name skill directory that
Showdar does not own.

## Extensions (0.9.0)

Extension packs are local, static, declarative directories installed from a
local directory or workspace-relative path. A pack carries `pack.json`
metadata (name, version, skills, workflows, pack-local profiles), skill
directories, custom workflow definitions, and docs. Packs contain no
executable hooks, lifecycle scripts, or remote code.

**Pack authoring & validation**

```bash
showdar create-pack <path> [--vendor <v>] [--description <text>] [--with-workflow <id>] [--with-profile <name>]
showdar validate-pack <local-path> [--json]
showdar inspect-pack <local-path> [--json] [--checkpoint <file>]
```

**Install & lifecycle**

```bash
showdar add-pack <local-path>
showdar list --extensions [--json]
showdar remove-pack <name>
showdar update-pack <local-path> [--dry-run] [--json]
```

**Diagnostics**

```bash
showdar doctor --extensions [--json]
```

`update-pack --dry-run` previews changes without mutation: file add/replace/remove
counts, descriptive change categories (`source-only`, `skill-content`,
`workflow-definition`, `profile-definition`, `metadata`, `reference`,
`ownership`, `installed-drift`), ownership conflicts, and whether the update is
currently executable. Categories are descriptive only and never claim checkpoint
compatibility. The preview is a read-only snapshot, not an authorization token:
a later `update-pack` re-plans from current state. Within a single update
execution, if source, installed files, manifest, or overrides change between
planning and applying that same plan, execution aborts as a stale plan with
zero mutation.

`inspect-pack --checkpoint` validates a workflow checkpoint against the candidate
effective catalog (current project state + candidate pack + project overrides) and
reports `compatible`, `workflow-incompatible` (with deterministic reason code and
`replanRequired`), or `malformed`. Malformed checkpoints report `schema-invalid` /
`malformed-checkpoint`, never `workflow-incompatible`.

`list --extensions --json` and `doctor --extensions --json` use the common CLI
envelope (`schemaVersion: 1`, `command`, `ok`, `data`, `warnings`, `errors`).
Existing `validate-pack --json` and plain `inspect-pack --json` shapes are
unchanged. `doctor` without a checkpoint reports `checkpointCompatibility:
"not-assessed"`. Diagnostics exit 0 when they successfully report state, even when
unhealthy; validation and execution failures exit 1.

**Pack metadata**

```bash
showdar add-workflow <local-path>
showdar init --pack <local-path>
```

Pack skill IDs use the `vendor/skill` namespace (for example,
`acme/lint`); the `showdar-` prefix is reserved for built-ins. Skill
`domains` are lowercase kebab-case discovery hints only (at most 8 per
skill) — they never create capabilities, routes, or authority.
Custom workflow description minimum is 10 characters.

Custom workflows compose built-in primitive stages under a `vendor-name`
ID (for example, `acme-release`). Stages, skip rules, and completion
policy follow the same frozen contracts as built-in workflows; custom
workflows cannot define new primitives, authority, evidence kinds, or
state schemas. Workflow state remains `schemaVersion: 1` and the trace
projection is unchanged.

```bash
showdar add-workflow ./workflows/acme-release.json
showdar init --pack ../acme-pack
```

Project overrides live in the user-owned `.showdar/overrides.json` file:
skill descriptions, discovery hints, advisory guidance text, custom
workflow policy refinement, and new project-owned profiles. Showdar reads
and validates the file but never rewrites or deletes it; built-in
workflow semantics and the seven built-in profiles cannot be overridden.
Pack-local profiles select pack-owned skills and workflows only.

Showdar computes a full-tree SHA-256 over the validated pack source at
install and records it in `.showdar.json` (`extensions.packs[].hash`).
The hash is source-tree identity — a docs-only edit changes it without
implying any behavior change. Drift means the source tree differs from
the recorded installation source. Source drift (`source-drift`) and
workflow incompatibility (`workflow-incompatible`) are separate concerns.

**Checkpoint compatibility**: Custom workflow checkpoints are revalidated
against the current explicit extension catalog at resume. A valid checkpoint
resumes normally. A checkpoint with a skip or stage no longer permitted by
the current workflow definition yields a `workflow-incompatible` outcome
with `replanRequired=true` — it is never fabricated into a `BLOCKED`
WorkflowState. Malformed checkpoints remain distinct from workflow
incompatibility. No pack hash, workflow fingerprint, or catalog snapshot is
persisted in checkpoints; `schemaVersion` remains 1.

Extensions cannot create capabilities, grant authority, modify Phase 6G,
change built-in workflow semantics or profiles, or execute arbitrary
code. Supported sources are local directories and workspace-relative
paths; tarball, URL, Git, and npm/registry sources are rejected.
Executable plugins/hooks are not supported.

Opt-in custom workflow evaluation (never part of the release gate):

```bash
node scripts/generate-custom-eval-fixture.mjs
node scripts/custom-workflows-eval.mjs \
  --scenarios .tmp/custom-eval-fixture/custom-scenarios \
  --pack .tmp/custom-eval-fixture/acme-pack/pack.json
```

## Diagnostics (0.9.0)

```bash
showdar doctor --extensions
```

Read-only diagnostics for installed extension state:
- manifest entries valid, installed files exist, ownership intact
- source drift (`source-drift`, `source-unavailable`, `installed-file-drift`, `ownership-conflict`)
- invalid overrides, duplicate/collision, broken profile references
- catalog construction failures
- source drift vs workflow incompatibility reported separately

Byte-for-byte override preservation is enforced; `.showdar/overrides.json` is
never rewritten by Showdar during any lifecycle operation.

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
showdar setup [--dry-run|--yes] [--tracker github|gitlab|local] [--docs-dir docs/agents]
showdar wizard [--mode add|replace] [--profile name] [--skills list] [--workflow list] [--ai target] [--scope project|global] [--yes|--dry-run]
showdar add profile <profile> [--ai <target>] [--scope <project|global>]
showdar add workflow <builtin-name|local-json-path> [--ai <target>] [--scope <project|global>]
showdar add-pack <local-path>
showdar remove-pack <name>
showdar add-workflow <local-path>
showdar list
showdar list --extensions
showdar status [--scope <project|global>]
showdar doctor [--scope <project|global>]
showdar doctor --extensions
showdar validate
showdar remove [--scope <project|global>]
showdar create-pack <path> [--vendor <v>] [--description <text>] [--with-workflow <id>] [--with-profile <name>]
showdar validate-pack <local-path> [--json]
showdar inspect-pack <local-path> [--json]
showdar update-pack <local-path>
showdar validate
showdar remove [--scope <project|global>]
```

Main flags are `--ai`, `--profile`, and `--scope`. `--ai` accepts `universal`,
`codex`, `opencode`, `cursor`, `claude`, or `all` for `init` (single targets
for `add`). `--scope` accepts `project` or `global` and defaults to `project`;
`--profile` accepts the seven canonical profiles and the deprecated
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
