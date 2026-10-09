# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

## [0.17.0]

### Added
- Renamed native portable `showdar-refine` to **`showdar-brainstorm`**, without a legacy CLI alias.
- Adaptive Markdown plan persistence and verification-backed task resume for the Brainstorm → Plan → Build workflow.
- Safe, hash-checked migration for CLI-owned legacy native skills and commands.

### Notes
- Plan files do not replace workflow checkpoints or imply approval, Git, publication or deployment authority.

## [0.16.0]

### Added

- Three portable first-class companion skills: `showdar-setup`, `showdar-refine`, and `showdar-domain-model`; native skills-only users no longer need the CLI for onboarding, refinement, or glossary/ADR guidance.
- Conditional refinement with explicit spec approval, adaptive Decision Brief persistence, and approval-bound architectural/domain documentation.

### Changed

- Companion catalog, profiles and validations support 25 installable skills while retaining 18 lifecycle primitives and 4 workflows.
- Existing lifecycle skills consume approved briefs and canonical glossary/ADR context without adding a second router.
- CLI installation migrates away from the legacy generated `/showdar-setup` command toward the portable skill with owned-file safety checks.


## [0.15.1]

### Fixed

- Reject malformed or unauthorized managed paths before removing project files; block symlink-based command writes and preflight installation collisions before replacing existing skills.
- Make extension pack updates fail closed on conflicts and installed drift, stage changes safely, restore the previous installation on failure, remove obsolete owned files and clean staging directories.
- Separate source pack identity from installed-tree hashes to avoid false drift reports when source-only documentation is not installed.
- Ensure adding an existing skill to another AI target installs that target, and return nonzero exit codes for failed JSON diagnostics.
- Correct `create-pack` destination handling and adapt the Codex benchmark to the current structural routing contract.
- Remove unused legacy scoring helpers from the thin router.

### Tests

- Add regression coverage for destructive manifest paths, symlink boundaries, failed replacements, pack drift and updates, CLI diagnostics, target switching, scaffold paths, and Codex benchmark guidance.


## [0.15.0]

### Changed

- Replaced the CLI `showdar wizard` entry point with `showdar setup`, preserving the interactive skills installer flow and `add --interactive` alias.
- Replaced the generated project-context template CLI with `/showdar-setup`, an evidence-based AI onboarding command for Cursor, OpenCode and Claude Code.
- Agent-driven setup now audits product/domain context alongside repository conventions, proposes diffs and requires approval and Git preflight before modifying docs.
- Retained existing intent routing and installation safeguards; no separate setup engine or router.

## [0.14.2]

### Changed

- Streamlined the README around quick start and common commands, preserving detailed documentation in `docs/REFERENCE.md`.
- Extended the generated `/showdar/setup` guidance to coordinate skill selection (when needed) with project context setup, explicit approvals and Git preflight.
- Included `docs/REFERENCE.md` in the npm package so its README documentation link works after publishing.

## [0.14.1]

### Changed

- Replaced readline-based interactive installer with keyboard-driven TUI powered by `@clack/prompts`: arrow-key menus for mode, agent, scope and profile; searchable multi-select for skills; checkbox multi-select for workflows; explicit preview and confirmation.
- Upgraded interactive `showdar setup` to show repository inspection, tracker selection, safe document-path input and an explicit create/preserve preview.
- Kept non-interactive `--yes`, `--dry-run`, `--json` paths and existing add/replace semantics unchanged.


## [0.14.0]

### Added

- Project-aware onboarding through `showdar setup`, including repository inspection, GitHub/GitLab/local tracker detection, package script discovery, read-only `--dry-run --json` planning, and interactive confirmation.
- Shared project documents under `docs/agents/` for project architecture, issue tracker, verification scripts and domain vocabulary; existing documents are preserved without overwrites, and agent routing guidance consumes them when present.
- Native `/showdar/setup` entrypoint on command-capable harnesses (OpenCode and Claude), preserving the frozen router semantics and unchanged 22-skill catalog.
- Interactive multi-select installation wizard (`showdar wizard` or `showdar add --interactive`) for profile, skills, workflows, agent target and project/global scope, with add/replace modes, previews and CI-friendly flags.

### Safety

- Setup edits require the existing Git preflight guard. Path traversal and symlinked output paths are rejected; no speculative glossary or ADR documents are created.
- The wizard defaults to additive installation and requires explicit `--mode replace` for removing managed skills. Non-interactive installation requires explicit selections and `--yes`.


## [0.13.0]

### Added

- `showdar add profile <profile>`: additive union of built-in profile primitives without replacing an existing base profile or other installed skills.
- `showdar add workflow <name>`: install built-in workflow skills and any missing stage primitives; `showdar add feature` / `showdar add showdar-feature` remain equivalent aliases.
- `showdar add workflow ./local.json`: convenient spelling for existing project-scoped custom workflow installation.

### Changed

- Additive installation preserves existing extension metadata and supports projects initialized with `--ai all`.
- `showdar init --profile ...` retains its explicit replace semantics; existing standalone `showdar add-workflow` remains supported.
- Added installer regression coverage for existing-skill preservation, aliases, workflow stage closure, custom workflows, foreign-path safety and re-init replacement.


## [0.12.1]

### Fixed

- Added read-only `showdar guard --mutation local-write --json` to block task writes on integration branches until task branch preparation, with an explicit repository-local direct-work opt-in.
- Updated native harness guidance and mutating skills to require automatic branch preparation and a passing guard before agent-controlled file writes; Cursor routing rules now apply automatically.
- Re-adding an existing Showdar-managed skill refreshes its packaged SKILL.md from the upgraded CLI only when its recorded hash matches; user-modified skill files are preserved and cause an explicit error.
- This is an agent/tool-instruction gate, not a cross-harness filesystem interceptor, and does not grant source/remote mutation authority.


## [0.12.0]

### Added

- Canonical `showdar route --stdin|--prompt [--json]` runtime bridge projecting lifecycle primary, advisors, the seven public Intent keys, advisory domain matches, and installed/missing skill availability.
- Specialized domain discovery overlay using deterministic Unicode phrase matching over `router/skill-map.yaml` inline trigger arrays; insurance terminology, underwriting/rating flows, and insurer API/UI review map to `showdar-insurance-domain`, `showdar-insurance-workflows`, and `showdar-insurance-review` without granting authority.
- `showdar git-start --type --name [--base] [--dry-run] [--json]` for deterministic safe local task-branch preparation without inferred staging, commit, merge, or push.
- Task branch isolation guidance: branch-before-edit on integration/default branches, repository-policy priority, one branch per coherent task, and conservative dirty-worktree blocking.

### Changed

- Managed harness instructions and commands invoke the canonical runtime router with native/static fallback when the CLI is unavailable.
- Init/add guidance reflects the complete installed set; add refreshes existing commands and instructions even when the skill is already installed.
- Showdar Git documents one branch per coherent task, repository-policy priority, and explicit completion/integration authority.
- Task completion defaults to verify and report; merge and push each require their own explicit authority.

### Safety / Compatibility

- Domain discovery does not grant authority and never replaces the lifecycle primary or rewrites Intent/mutation.
- Phase 6G authority, state, evidence, trace, and manifest contracts unchanged; no engine vendoring into projects.
- No implicit branch commit/merge/push; no automatic stash, reset, restore, or clean.
- Existing v0.11 projects remain compatible; no migration required.

## [0.11.0]

### Added

- Add three independently installable insurance skills for insurer domain terminology, cross-line-of-business workflows, and terminology/API review, with Vietnamese–English–technical mappings and insurer/product-specific scoping.
- Add an insurance profile and route insurance-domain requests to the relevant skills without limiting the system to motor insurance or HDInsurance.

## [0.10.0]

### Added

- `showdar update-pack <path> --dry-run` read-only snapshot preview using the same canonical planning logic as execution; explicit public projection with deterministic ordering, descriptive change categories (`source-only`, `skill-content`, `workflow-definition`, `profile-definition`, `metadata`, `reference`, `ownership`, `installed-drift`), and `executable` status.
- Canonical internal pack update planning (`src/pack-plan.js`): `planPackUpdate()`, `verifyPlanPreconditions()`, `executePackUpdate()` with same-lifecycle TOCTOU fingerprint protection (source, installed owned files, relevant manifest state, overrides bytes). Stale plans abort with zero mutation.
- `showdar inspect-pack <path> --checkpoint <file>` checkpoint compatibility explanation against the candidate effective catalog (current project + candidate pack + project overrides). Deterministic semantic reason codes (`workflow-missing`, `workflow-state-compat-unsupported`, `stage-removed`, `selected-stage-invalid`, `required-stage-conflict`, `skip-policy-invalid`, `recorded-skip-invalid`) with fixed precedence; malformed checkpoints report `schema-invalid` / `malformed-checkpoint`.
- `showdar list --extensions --json` and `showdar doctor --extensions --json` using the common CLI envelope (`schemaVersion: 1`). Doctor reports `checkpointCompatibility: "not-assessed"` without a checkpoint. Diagnostics exit 0 on successful report.

### Changed

- `src/pack-update.js` refactored around canonical planning; v0.9 staged replacement and rollback safety preserved.
- `list --extensions` human output now shows pack health status and pack profiles.
- `create-pack` skill scaffold cleaned up (full required sections, substantive guidance, no filler) with validation guidance output.
- TOCTOU lifecycle clarified: `--dry-run` is a read-only snapshot, not an authorization token. A later `update-pack` re-plans from current state. Stale-plan protection applies within a single execution lifecycle (`planPackUpdate` → `verifyPlanPreconditions` → `executePackUpdate`).

### Fixed

- `inspectCustomWorkflows` read `validateCustomWorkflowDoc` as `{ok, errors}` but the validator returns an error array, so `valid` was always `undefined` and doctor reported every workflow invalid. Now maps `errors.length === 0` to `valid`. Internal helper shape only; public CLI output unchanged.
- `executePackUpdate` referenced undefined `manifestPath`; now resolves the project manifest path before writing. Covered by real update-path regression test.

### Compatibility / Safety

- v0.9 `validate-pack --json` (`{ok, errors}`) and plain `inspect-pack --json` shapes unchanged; backward-compat fixture tests added.
- No persisted preview plans or tokens. No manifest v3, no workflow-state schema change, no WorkflowState key change.
- Phase 6G authority, 15 primitives, 4 workflows, 6 profiles, 10 trace events frozen.
- Dry-run is a snapshot, not a stored plan. No migration required. No tarball, remote registry, or executable plugins.

## [0.9.0]

### Added

- Pack authoring CLI: `showdar create-pack <path>` scaffolds a minimal valid extension pack with `--vendor`, `--description`, `--with-workflow`, `--with-profile` flags; no interactive wizard.
- Pack validation CLI: `showdar validate-pack <path> [--json]` performs dry-run validation without installation; deterministic JSON output.
- Pack inspection CLI: `showdar inspect-pack <path> [--json]` outputs normalized read-only model (source, identity, skills, workflows, profiles, domains, full-tree hash, drift, compatibility, warnings, errors).
- Pack diagnostics CLI: `showdar doctor --extensions` read-only diagnostics for installed extensions (source drift, ownership, catalog, overrides, profile refs, catalog build failures, collisions).
- Pack update CLI: `showdar update-pack <local-path>` safe staged replacement with rollback; validates candidate before replacement; preserves overrides/foreign files; refuses unsafe overwrite; no network access.
- Checkpoint compatibility assessment layer: `assessCheckpointCompatibility(checkpoint, extensionCatalog)` returns ephemeral `{compatible, replanRequired, reason}`; strict deserialization preserved; invalid checkpoints yield `workflow-incompatible` + `replanRequired` without fabricating BLOCKED WorkflowState; malformed checkpoints distinct from policy incompatibility.
- Structured extension error model: 12 categories (`schema-invalid`, `namespace-invalid`, `collision`, `protected-field`, `unsafe-path`, `source-unavailable`, `source-unsupported`, `ownership-conflict`, `workflow-incompatible`, `profile-reference-invalid`, `override-invalid`, `drift-detected`) with stable codes and human messages; separate from drift.
- Custom workflow description minimum lowered from 30 to 10 characters.
- Source drift vs workflow incompatibility separation: source drift (`source-drift`) is hash-based identity change; workflow incompatibility (`workflow-incompatible`) is current-catalog validation failure; never conflated.
- `showdar doctor --extensions` reports source drift and workflow compatibility separately (`source.drift`, `workflow.compatibility`); `inspect-pack --json` exposes normalized model; `list --extensions` grouped output with drift status.
- Override precedence inspection: effective value + source (`built-in`/`pack:<name>`/`project-override`) + `protected` flag via `--json` surfaces.
- Update-pack safety: staged replacement with rollback; validates candidate before replacement; preserves overrides/foreign files; refuses unsafe overwrite; no network access; fails on ownership conflict/missing managed file; workflow removal validation; manifest updated only after successful replacement.
- Override precedence inspection via `computePrecedence` in `pack-inspect.js`: per-field effective value, source (`built-in`/`pack:<name>`/`project-override`), protected flag.
- Custom workflow description minimum lowered from 30 to 10 characters (schema + validator).
- Domain cap remains 8 with improved validation messages; domains remain discovery-only hints.
- Error model: 12 structured categories with stable machine-readable codes + human messages; `drift-detected` distinct from `workflow-incompatible`.

### Changed

- `showdar doctor --extensions` now supports `--extensions` flag for extension diagnostics.
- `showdar list --extensions` output improved: grouped PACKS/WORKFLOWS/PROFILES/OVERRIDES with drift status.
- Custom workflow description minimum lowered 30 → 10 (schema + validator).
- `validate-pack` uses existing canonical validation path; `--json` for machine-readable output.
- `inspect-pack` outputs deterministic normalized model (human + `--json`).
- Source drift (`source-drift`) and workflow incompatibility (`workflow-incompatible`) are distinct concepts with separate reporting.
- `update-pack` warns on workflow definition changes: "Existing checkpoints referencing changed custom workflows will be revalidated on resume."

### Security

- `update-pack` refuses unsafe overwrite; validates candidate before replacement; staged replacement with atomic finalization; rollback on failure; overrides and foreign files preserved byte-identical; no network access; no lifecycle scripts/hooks; local directory sources only.

### Fixed

- Custom workflow description minimum lowered from 30 to 10 characters.
- Extension error categories now structured with stable codes and human messages.
- Source drift and workflow incompatibility are no longer conflated in reporting.

### Fixed

- Preserve extension-catalog context while validating skipped custom-workflow stages so valid checkpoints can serialize, deserialize, and resume correctly.

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
