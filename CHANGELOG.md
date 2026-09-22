# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.8.0]

### Added

- Local extension packs: static declarative directories (`pack.json` metadata only, no content hash) installed from a local directory or workspace-relative path.
- Custom workflows composed from built-in primitive stages (`vendor-name` IDs), with canonical skip reasons/policies and the frozen completion contract.
- Immutable deterministic extension catalog snapshots (`createExtensionCatalog`): no global registry, input-order independent, duplicate/collision rejecting.
- Pack-local and project-local profiles; the six built-in profiles remain primitive-only and immutable.
- User-owned `.showdar/overrides.json` for descriptions, discovery hints, guidance, custom-workflow policy refinement, and new project profiles.
- CLI: `showdar add-pack <path>`, `showdar remove-pack <name>`, `showdar add-workflow <path>`, `showdar init --pack <path>`, `showdar list --extensions`.
- Full-tree pack hashing: Showdar computes SHA-256 over the validated source tree at install and records it in `.showdar.json` (`extensions.packs[].hash`); docs-only edits change the hash as source identity, not as a behavior claim.
- Opt-in custom workflow evaluation (`npm run eval:custom-workflows`); never part of `npm run eval` or the release gate.

### Changed

- Workflow-state APIs accept an optional explicit extension-catalog context; omitted context preserves built-in behavior exactly. State schema stays `schemaVersion: 1`.
- Trace projection accepts `input.extensionCatalog` as validation context only; event types, envelope, and ordering are unchanged.
- Manifest v2 gains an optional additive `extensions` object (`packs[]`, `customWorkflows[]`, `overrides` metadata). Existing manifests without it remain valid.

### Security

- Built-in workflow policy (stages, required stages, skips, completion, identity) and built-in profile definitions are protected and non-overrideable.
- Recursive structured authority-key rejection (`primaryCapability`, `authorizedAction`, `mutationPermission`, `routeAuthority` and all canonical `FORBIDDEN_AUTHORITY_KEYS`); ordinary prose is not censored.
- Path/symlink/ownership protection on pack install, removal, and override reads; foreign files are never silently overwritten or deleted.
- Local-only source model: no network, Git, npm/registry, or executable hooks. Tarball, URL, and Git pack sources are rejected in 0.8.
- Extensions cannot create capabilities, grant authority, modify Phase 6G, mutate built-ins, or execute code.

### Migration

- No migration required. Existing 0.7 installs, manifests (v2), checkpoints (schemaVersion 1), profiles, and adapters work unchanged. Extensions and overrides are opt-in; no mandatory action for existing users.

## [0.7.0]

### Added

- Deterministic workflow trace projection (`src/workflow-trace.js`): pure
  state-diff observation over workflow transitions with 10 closed semantic
  event types, no timestamps, no authority content, and no automatic
  persistence.
- Workflow benchmark scenario schema and loader
  (`benchmark/schema/workflow-scenario.schema.json`,
  `benchmark/lib/workflow-scenario-loader.js`).
- Deterministic workflow benchmark corpus
  (`benchmark/scenarios/workflows/`, 16 scenarios): exact-match M1–M10
  invariants covering selection, skip policy, verification preservation,
  stale-resume blocking, authority invariance, and completion.
- `npm run eval:workflows` driver
  (`scripts/workflow-observability-eval.mjs`).

### Changed

- `npm run eval` now runs retrieval evaluation (`eval:retrieval`) followed
  by workflow evaluation (`eval:workflows`); release evaluation blocks on
  exact workflow invariants.
- `npm run check` remains test/validate/package correctness only.

### Safety

- Traces contain normalized semantic data only (IDs, enums, receipt
  summaries, statuses): no authority state, raw prompts, logs, telemetry,
  or network reporting.

## [0.6.0]

### Added

- Portable workflow execution state (`src/workflow-state.js`): versioned
  JSON checkpoint schema (schemaVersion 1) with stage selection, evidence
  receipts, structured skip, interruption, and resume. State never persists
  authority; resume always re-resolves through Phase 6G. Caller/harness
  owns persistence; no filesystem store, backend, or telemetry.
- Workflow checkpoint documentation in all four workflow skills
  (feature, bugfix, release, incident): serialization,
  interruption/resume, stale-checkpoint blocking, and stage vs workflow
  completion semantics.
- Workflow-state policy validation in `src/validate.js`: catalog coverage,
  no authority fields in checkpoints, no harness or storage coupling.

### Changed

- Four workflow skills now describe adaptive state semantics instead of
  ephemeral-only tracking.
- Workflow completion explicitly distinguishes stage completion (primitive
  evidence and stop conditions) from workflow completion (all selected
  stages completed or validly skipped, no blockers, required verification
  satisfied).

### Safety

- Checkpoint state never persists authority-derived fields.
- Caller owns checkpoint persistence; Showdar chooses no storage.
- Stale checkpoints block with `replanRequired` rather than continuing.

## [0.5.0]

### Added

- Native per-harness adapter layer over the unchanged portable core
  (15 primitives + 4 workflows, 19 total installable skills).
- Generated OpenCode slash commands
  (`.opencode/commands/showdar/`): one direct command per installed skill
  plus a generic `/showdar/skill` aggregator reflecting the installed set.
- Generated Claude Code slash commands
  (`.claude/commands/showdar/`): one direct command per installed skill
  plus a generic `/showdar/skill` aggregator reflecting the installed set.
- Claude Code `CLAUDE.md` managed-block integration from the canonical
  instruction body.
- Cursor native `.cursor/rules/showdar.mdc` rule (Apply Intelligently,
  `alwaysApply: false`, no globs) from the canonical instruction body.
- Canonical adapter renderers (`src/adapter-renderers.js`) for
  instructions, direct commands, and the generic aggregator.
- Adapter lifecycle and ownership validation: doctor/status checks for
  active instruction surfaces, generated commands, and aggregators;
  stale Showdar-owned artifact cleanup on target switching.

### Changed

- Installer manages harness-native command and instruction artifacts
  alongside portable skills.
- Doctor/status validate active adapter artifacts; global installs do not
  require instruction files and non-command hosts do not require commands.
- `--ai all` is a compatibility aggregate: all skill roots, OpenCode and
  Claude commands, and only the canonical `AGENTS.md` instruction block
  (no `CLAUDE.md` block, no Cursor rule).

## [0.4.0]

### Added

- First-class workflow skill model: 15 primitives (`kind: primitive`) plus 4
  workflows (`kind: workflow`) for 19 total installable skills.
- `showdar-feature`: adaptive end-to-end feature implementation over
  understand, requirements, plan, design, build, test, and review stages.
- `showdar-bugfix`: adaptive defect resolution over understand, debug, build,
  test, and review stages, including investigation-only mode.
- `showdar-release`: release readiness versus execution separation over
  quality, security, ship, and authority-gated ops stages.
- `showdar-incident`: operational incident investigation and recovery over
  understand, debug, recover, verification, and authority-gated ops stages.
- `showdar add feature|bugfix|release|incident` installs workflows through the
  existing installer; short names normalize like primitives.
- Workflow composition and safety validation: stage references resolve to
  known primitives, workflows never stage another workflow or themselves,
  and workflow SKILL.md files stay lean by referencing primitives.

### Changed

- Catalog distinguishes primitive and workflow skills; `getSkill` and
  `normalizeSkillName` resolve all 19 installable skills.
- `showdar validate` reports primitive/workflow/total counts
  (`15 primitives, 4 workflows, 19 total`).
- `showdar add` normalization supports workflow IDs and short names.
- OpenCode `skill.md` command lists all 19 skills with a whole-task versus
  single-primitive selection guard.
- AGENTS.md managed routing block includes workflow routes when installed.

## [0.3.0]

### Added

- Explicit harness targets for `showdar init` and `showdar add`: `codex`,
  `opencode`, `cursor`, `claude`, `universal`, and `all`.
- `showdar add <skill>` for installing a single primitive skill without
  re-running a whole profile (for example `showdar add debug`,
  `showdar add security --ai cursor`,
  `showdar add review --scope global --ai claude`).
- Native Cursor skill roots (`.cursor/skills` for projects,
  `~/.cursor/skills` for global installs).
- Deny-by-default routing authority coverage for conditional, modal,
  contextual, hypothetical, and negated actions.

### Changed

- Each harness target now installs into its native skill directory instead of
  sharing one compatibility root.
- Routing uses a single authoritative engine: current request → structural
  interpretation → authority classification → primary capability → skill.
- Context, log, and example text no longer becomes requested work on its own;
  conditional and hypothetical actions stay non-authoritative until current
  request semantics permit them.
- Risk metadata no longer overrides an explicit governing action.

### Fixed

- Conditional, modal, context, and negation authority safety cases.
- Security-risk ownership cases where risk signals previously stole primary
  ownership from the governing action.
- Debug, upgrade, build, and test imperative recognition for explicit
  governing requests.

### Removed

- The executable legacy 6F authority engine and the old route-scoring path.

## [0.2.3]

See git history for changes before the 0.3.0 changelog was started.
