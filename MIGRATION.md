# Migrating to 0.7.0

0.7.0 adds deterministic workflow trace projection
(`src/workflow-trace.js`) and a workflow benchmark corpus over the
unchanged 0.6 runtime. No user action is required.

- Existing 0.6 installs and configs remain valid: no workflow-state
  schema migration (still schemaVersion 1), no config migration, no
  adapter migration, no checkpoint migration.
- Runtime workflow semantics are unchanged; traces observe released
  behavior only and never affect execution, routing, or authority.
- The new `src/workflow-trace.js` module ships in the package; benchmark
  scenarios, schema, loader, and eval driver are development/release
  tooling and do not ship.
- No telemetry, network reporting, automatic storage, or tracking is
  introduced.

# Migrating to 0.6.0

0.6.0 adds portable workflow execution state (`src/workflow-state.js`,
schemaVersion 1) over the unchanged 15 primitives, 4 workflows, and Phase 6G
authority.

- Existing 0.5 installs and configs remain valid; no adapter or config
  migration is required.
- The four workflows now support explicit portable execution state:
  stage selection and progression, evidence-backed skipping, stage vs
  workflow completion, interruption, and resume.
- Checkpoints are plain JSON at schemaVersion 1. Persistence is owned by
  the caller or harness; Showdar 0.6 defines no state directory, backend,
  session registry, or telemetry.
- Resume always re-resolves current context through Phase 6G. Stale
  checkpoints return `BLOCKED` with `replanRequired` instead of silently
  continuing.
- Checkpoints never persist authority. No migration of prior route or
  authority state exists or is needed.
- No config change is required. Callers that never persist a checkpoint
  keep the previous ephemeral-only behavior.

# Migrating to 0.5.0

0.5.0 adds a thin native adapter layer over the unchanged portable core.
Existing 0.4 `.showdar.json` v2 configs remain valid; no schema bump is
required (adapter metadata is additive and optional).

- Re-running `showdar init ...` may add native adapter artifacts for the
  selected harness. Existing skill content remains unchanged when hashes
  match.
- Claude: 0.5 adds the `CLAUDE.md` managed block plus native Showdar
  command files under `.claude/commands/showdar/`.
- Cursor: 0.5 adds `.cursor/rules/showdar.mdc` (Apply Intelligently,
  `alwaysApply: false`, no globs).
- OpenCode: existing command behavior is extended through the canonical
  generated command lifecycle (one direct command per installed skill plus
  `/showdar/skill`).
- `--ai all` is a defined compatibility aggregate: all skill roots,
  OpenCode and Claude commands, and only the `AGENTS.md` block (no
  `CLAUDE.md` block, no Cursor rule).
- Global scope installs skills and OpenCode/Claude commands where
  applicable, with no managed global instruction files.
- Removal deletes only Showdar-owned adapter artifacts and managed blocks;
  user content outside Showdar markers remains intact.
- Portable skill/workflow semantics and Phase 6G authority are unchanged.

# Migrating to 0.4.0

0.4.0 adds four optional workflow skills over the unchanged 15 primitives:

```bash
showdar add feature
showdar add bugfix
showdar add release
showdar add incident
```

- 0.3.0 `.showdar.json` v2 configs remain valid; no config-version migration
  is required.
- All 15 primitive IDs remain unchanged.
- Profile behavior and composition are unchanged: `minimal` (8), `developer`
  (12), `backend` (14), `qa` (9), `product` (6), `full` (15 primitives).
- Workflows are additive and optional; they complement rather than replace
  primitives. Nothing is removed.
- No Phase 6G routing migration is required; the authority engine and the
  15-capability primitive taxonomy are unchanged.
- Single primitive requests keep resolving to primitives; whole-task or
  lifecycle requests may select a workflow.

# Migrating to 0.3.0

## Skill install roots

`--ai universal` still installs to `.agents/skills` (project) and
`~/.agents/skills` (global). Explicit harness targets now use their native
roots:

- OpenCode: `.opencode/skills` / `~/.config/opencode/skills`
- Cursor: `.cursor/skills` / `~/.cursor/skills`
- Claude Code: `.claude/skills` / `~/.claude/skills`
- Codex: `.agents/skills` / `~/.agents/skills`

One invocation installs to one resolved root only; no compatibility copies
are made automatically.

## Existing projects

Existing `.showdar.json` v2 configs remain valid. No config-version migration
is required. Re-running `showdar init` with an explicit `--ai` target moves
managed skills to the newly requested native root; the previous root is not
silently deleted unless existing Showdar stale-cleanup semantics apply.

## Profiles

Profile names and composition are unchanged:

- `minimal` (8), `developer` (12), `backend` (14), `qa` (9), `product` (6),
  `full` (15).
- `mobile` and `web` remain accepted as deprecated aliases for `developer`;
  manifests store the canonical name.

## Single-skill additions

Use `showdar add <skill>` instead of re-running a larger profile to add one
skill:

```bash
showdar add debug
showdar add security --ai cursor
showdar add review --scope global --ai claude
```

Additions preserve the configured profile and are idempotent.

## Routing behavior

0.3.0 uses stricter deny-by-default authority semantics. Conditional,
hypothetical, contextual, and negated actions stay non-authoritative until
current request semantics permit them, and risk metadata no longer overrides
an explicit governing action. Do not assume byte-identical routing with older
releases where behavior intentionally tightened.
