# Intent Extensibility Design 0.10

**Status**: FINAL FROZEN DESIGN  
**Baseline**: v0.9.0 (commit `a9f2664bcb1d92e8c70f364a7779577282c8b855`)  
**Package version during implementation**: 0.9.0 (no bump until release prep)  
**Design date**: 2026-09-29  
**Correction date**: 2026-09-29

---

## 1. Executive Summary

0.10 makes extension changes **predictable and explainable before mutation**, and makes pack authoring/debugging easier — without expanding Showdar's authority or plugin trust model.

The primary deliverable is `showdar update-pack <path> --dry-run`: a read-only preview that reuses the exact same planning logic as real execution. Supporting improvements include deterministic compatibility reason codes, `list --extensions --json`, `doctor --extensions --json`, and authoring ergonomics.

**No new transport mechanism. No authority expansion. No schema migration. No v0.9 JSON contract change.**

---

## 2. v0.9 Baseline

Released v0.9.0 provides:

| Command | Purpose |
|---------|---------|
| `create-pack <path>` | Scaffold minimal valid pack |
| `validate-pack <path> [--json]` | Dry-run validation |
| `inspect-pack <path> [--json]` | Normalized read-only model |
| `doctor --extensions` | Read-only diagnostics |
| `update-pack <path>` | Safe staged replacement |
| `add-pack <path>` | Install pack |
| `remove-pack <name>` | Remove pack |
| `add-workflow <path>` | Install standalone workflow |
| `list --extensions` | Basic listing |

Internal capabilities:
- `assessWorkflowCompatibility(checkpoint, catalog)` — ephemeral compatibility check
- `computePrecedence()` — override precedence inspection
- 12 structured error categories
- Source drift vs workflow incompatibility separation
- Full-tree SHA-256 pack hashing
- Staged update with rollback

---

## 3. Actual v0.9 Audit

### 3.1 CLI Surfaces (verified)

```
showdar create-pack <path> [--vendor <v>] [--description <text>] [--with-workflow <id>] [--with-profile <name>]
showdar validate-pack <local-path> [--json]
showdar inspect-pack <local-path> [--json]
showdar doctor --extensions
showdar update-pack <local-path>
showdar list --extensions
```

### 3.2 What v0.9 Does Well

- `update-pack` validates candidate before mutation, uses staged replacement, preserves overrides/foreign files, rolls back on failure
- `inspect-pack --json` produces deterministic normalized output
- `assessWorkflowCompatibility` correctly distinguishes malformed vs workflow-incompatible
- `create-pack --with-workflow` generates valid workflow with canonical skip reasons
- 12 error categories are stable and well-separated
- Source drift is identity-only (hash-based), never conflated with behavior

### 3.3 What v0.9 Lacks

1. **No update preview** — `update-pack` executes immediately; no `--dry-run` flag
2. **No checkpoint compatibility CLI** — `assessWorkflowCompatibility` exists internally but no user-facing command exposes it
3. **`list --extensions` is bare** — shows name/version/hash but no drift status, no workflow/profile details, no `--json`
4. **`doctor --extensions` has no `--json`** — human-only output
5. **No deterministic compatibility reason codes** — reasons are free-form strings
6. **No common JSON envelope** — each command has its own ad-hoc JSON shape
7. **No `create-workflow` command** — must manually create workflow JSON after `create-pack`
8. **No source relink** — if source directory moves, user must manually fix
9. **Scaffold skill template is verbose** — 120+ lines of boilerplate for a minimal skill

### 3.4 Architecture Observations

- `pack-update.js` has the core update logic but no planning/preview separation
- `pack-inspect.js` has `assessWorkflowCompatibility` and `computePrecedence` but they're not exposed via CLI
- `extension-errors.js` has 12 categories but no subcodes/reasons
- `bin/showdar.js` has no `--dry-run` flag on `update-pack`
- `listExtensions()` in `project.js` returns minimal data (name, version, hash only)

### 3.5 v0.9 JSON Contracts (STABLE — DO NOT CHANGE)

| Command | JSON Shape | Status |
|---------|-----------|--------|
| `validate-pack --json` | `{ ok, errors }` | **Existing/Stable** |
| `inspect-pack --json` | `{ ok, name, version, description, source, skills, workflows, profiles, domains, fullTreeHash, warnings, errors, manifest }` | **Existing/Stable** |

These shapes MUST NOT change in 0.10. No wrapping, no envelope, no schemaVersion added.

---

## 4. Dogfood / Backlog Findings

### Already Solved in 0.9 (do NOT re-solve)

- Workflow description minimum 30 → 10
- Structured drift categories
- Effective override inspection
- create-pack scaffold
- inspect/doctor
- update lifecycle
- checkpoint compatibility distinction

### Real Remaining Friction (from audit)

| Priority | Friction | Root Cause |
|----------|----------|------------|
| P1 | Can't preview update before executing | No `--dry-run` on `update-pack` |
| P1 | Can't check checkpoint compatibility via CLI | `assessWorkflowCompatibility` not exposed |
| P2 | `list --extensions` shows no health status | `listExtensions()` returns minimal data |
| P2 | `doctor --extensions` has no `--json` | Not implemented |
| P2 | Compatibility reasons are free-form strings | No deterministic reason codes |
| P3 | No `create-workflow` command | Must hand-edit JSON |
| P3 | Scaffold skill template is bloated | 120+ lines boilerplate |
| P3 | No source relink | Manual fix required |

---

## 5. 0.10 Goals

1. **Update preview** — Show exactly what `update-pack` would do before any mutation
2. **Compatibility explainability** — User-facing checkpoint compatibility check with deterministic reason codes
3. **Diagnostic output consistency** — `--json` on `doctor --extensions` and `list --extensions`
4. **Authoring ergonomics** — Leaner scaffold, better workflow/skip guidance
5. **Machine-readable tooling** — Stable JSON contracts for automation

---

## 6. Non-Goals

- No new transport mechanism (tarball, Git, URL, npm)
- No authority expansion
- No executable extension code
- No schema/state migration
- No manifest migration
- No built-in policy change
- No registry/marketplace
- No signing/trust roots
- No GUI
- No `doctor --fix` (diagnostics remain read-only)
- No change to v0.9 JSON output shapes
- No modification to `src/workflow-state.js`

---

## 7. Proposed CLI UX

### 7.1 New: `update-pack --dry-run`

```bash
showdar update-pack <local-path> --dry-run [--json]
```

Output (human):
```
Update preview for pack: my-pack
Status: would-update
Current: 0.1.0 (hash: abc123...)
Candidate: 0.2.0 (hash: def456...)

Changes:
  [source-only] README.md
  [skill-content] skills/my-skill/SKILL.md
  [workflow-definition] workflows/my-flow.json (modified)

Files:
  Add: 0  Replace: 2  Remove: 0

Overrides: preserved (no conflicts)
Installed files: no drift detected

Safe to execute: yes
Run without --dry-run to apply.
```

Output (`--json` — NEW envelope, see §17):
```json
{
  "schemaVersion": 1,
  "command": "update-pack",
  "ok": true,
  "data": {
    "pack": "my-pack",
    "currentVersion": "0.1.0",
    "candidateVersion": "0.2.0",
    "currentHash": "abc123...",
    "candidateHash": "def456...",
    "hashChanged": true,
    "changes": [
      { "categories": ["source-only"], "path": "README.md", "action": "replace" },
      { "categories": ["skill-content"], "path": "skills/my-skill/SKILL.md", "action": "replace" },
      { "categories": ["workflow-definition"], "path": "workflows/my-flow.json", "action": "replace" }
    ],
    "files": { "add": 0, "replace": 2, "remove": 0 },
    "overrides": { "preserved": true, "conflicts": [] },
    "installedDrift": "none",
    "executable": true
  },
  "warnings": [],
  "errors": []
}
```

### 7.2 New: `inspect-pack --checkpoint`

```bash
showdar inspect-pack <local-path> --checkpoint <file> [--json]
```

Output (human):
```
Checkpoint compatibility: workflow-incompatible
Replan required: yes
Reason: recorded-skip-invalid
Detail: Skip reason 'no-ux-decision' for stage 'showdar-test' is no longer accepted by workflow 'my-flow'
Affected workflow: my-flow
Affected stage: showdar-test

Run `showdar update-pack <path> --dry-run` to preview update.
```

Output (`--json` — NEW envelope, see §17):
```json
{
  "schemaVersion": 1,
  "command": "inspect-pack",
  "ok": true,
  "data": {
    "checkpoint": {
      "compatible": false,
      "replanRequired": true,
      "category": "workflow-incompatible",
      "reason": "recorded-skip-invalid",
      "detail": "Skip reason 'no-ux-decision' for stage 'showdar-test' is no longer accepted by workflow 'my-flow'",
      "affectedWorkflow": "my-flow",
      "affectedStage": "showdar-test"
    }
  },
  "warnings": [],
  "errors": []
}
```

### 7.3 Enhanced: `list --extensions --json`

```bash
showdar list --extensions --json
```

Output (NEW envelope, see §17):
```json
{
  "schemaVersion": 1,
  "command": "list",
  "ok": true,
  "data": {
    "packs": [
      {
        "name": "my-pack",
        "version": "0.2.0",
        "hash": "def456...",
        "status": "healthy",
        "drift": "no-drift"
      }
    ],
    "customWorkflows": [
      { "id": "my-flow", "source": "pack:my-pack", "path": ".showdar/extensions/packs/my-pack/workflows/my-flow.json" }
    ],
    "profiles": [
      { "name": "my-profile", "source": "pack:my-pack", "members": ["my-skill", "my-flow"] }
    ],
    "overrides": { "present": true, "status": "valid" }
  },
  "warnings": [],
  "errors": []
}
```

### 7.4 Enhanced: `doctor --extensions --json`

```bash
showdar doctor --extensions --json
```

Output (NEW envelope, see §17):
```json
{
  "schemaVersion": 1,
  "command": "doctor",
  "ok": true,
  "data": {
    "healthy": true,
    "packs": [
      {
        "name": "my-pack",
        "version": "0.2.0",
        "hash": "def456...",
        "drift": "no-drift",
        "validation": { "ok": true, "errors": [] }
      }
    ],
    "customWorkflows": [
      { "id": "my-flow", "valid": true, "errors": [] }
    ],
    "overrides": { "present": true, "status": "valid" },
    "issues": [],
    "warnings": [],
    "checkpointCompatibility": "not-assessed"
  },
  "warnings": [],
  "errors": []
}
```

---

## 8. Change-Plan Architecture

### 8.1 Internal ExtensionChangePlan (NOT PUBLIC)

A new internal immutable `ExtensionChangePlan` is introduced in `src/pack-plan.js`. This is **internal only** and MUST NOT be directly serialized to CLI JSON.

```js
// INTERNAL — src/pack-plan.js — not a public contract
{
  current: {
    name, version, hash, source, manifest, files: [{path, hash}]
  },
  candidate: {
    name, version, hash, source, manifest, files: [{path, hash}]
  },
  identity: {
    sameName, sameVersion, sameHash
  },
  files: {
    add: [{path, hash}],
    replace: [{path, oldHash, newHash}],
    remove: [{path, hash}]
  },
  skills: {
    add: [skillId],
    remove: [skillId],
    contentChanged: [skillId]
  },
  workflows: {
    add: [workflowId],
    remove: [workflowId],
    definitionChanged: [workflowId]
  },
  profiles: {
    add: [profileName],
    remove: [profileName],
    definitionChanged: [profileName]
  },
  overrides: {
    preserved: bool,
    conflicts: [{path, reason}]
  },
  references: {
    broken: [{path, reason}]
  },
  conflicts: [{type, path, reason}],
  warnings: [string],
  executable: bool,
  fingerprint: { sourceHash, installedHash, manifestHash, overridesHash }
}
```

### 8.2 Public Dry-Run Projection (PUBLIC)

The CLI JSON projection is a **separate, stable, explicitly defined** view of the internal plan. It exposes a curated subset of fields. Internal fields MUST NOT leak.

```js
// PUBLIC — CLI --json output for update-pack --dry-run
{
  schemaVersion: 1,
  command: "update-pack",
  ok: bool,
  data: {
    pack, currentVersion, candidateVersion, currentHash, candidateHash, hashChanged,
    changes: [{ categories: [string], path, action }],
    files: { add, replace, remove },
    overrides: { preserved, conflicts: [] },
    installedDrift: string,
    executable: bool
  },
  warnings: [string],
  errors: [{ category, code, message, details }]
}
```

**Rules:**
- Internal plan fields not listed above MUST NOT appear in CLI JSON
- Adding new internal fields does NOT change the CLI contract
- Adding new CLI fields is additive-only (requires `schemaVersion` bump for breaking changes)
- Deterministic ordering: arrays sorted by `path`; warnings/errors in generation order

### 8.3 Single Planning Path

Both `update-pack --dry-run` and `update-pack` (real execution) call the same `planPackUpdate()` function:

```
planPackUpdate({ cwd, source }) → ExtensionChangePlan (internal)
```

- `--dry-run`: project plan to public JSON, no mutation
- `update-pack`: create plan → verify preconditions → execute plan

### 8.4 Preview/Execution Parity

The plan captures a `PlanFingerprint` at planning time (see §10). Before execution, `executePackUpdate()` rechecks preconditions. If any fail → abort with stale-plan error. **Execution never independently rediscovers or reclassifies the update.**

---

## 9. Dry-Run Semantics

### 9.1 Guarantees

- **No filesystem mutation** — no writes, no copies, no deletions
- **No manifest mutation** — `.showdar.json` untouched
- **No override mutation** — `.showdar/overrides.json` untouched
- **Read-only** — only `readFile`, `readdir`, `lstat`, `hashTree`

### 9.2 What It Reports

| Field | Source |
|-------|--------|
| Current installed identity | `.showdar.json` → `extensions.packs[]` |
| Candidate identity | `pack.json` in source directory |
| Hash comparison | `hashTree()` on both trees |
| File-level diff | `buildPackFileList()` on both trees |
| Skill add/remove | Manifest skill list diff |
| Workflow add/remove | Manifest workflow list diff |
| Workflow definition change | `compareWorkflowDefinitions()` |
| Profile add/remove | Manifest profile diff |
| Ownership conflicts | `ownedPathSet()` intersection |
| Installed-file drift | `hashTree()` on installed pack |
| Source drift | Source hash vs recorded hash |
| Overrides affected | Override path intersection with pack files |
| Broken references | Profile member validation |
| Executable | All conflict checks pass |

### 9.3 What It Does NOT Claim

- Does NOT claim "behavior-compatible" or "checkpoint-compatible"
- Does NOT claim "safe-to-resume"
- May warn: "existing checkpoints referencing changed workflows will be revalidated on resume"

---

## 10. TOCTOU Model

### 10.1 Problem

Between `--dry-run` and real execution, the filesystem may change (another process modifies source, installed pack, or overrides).

### 10.2 PlanFingerprint Exact Semantics

`planPackUpdate()` captures a `PlanFingerprint`:

```js
{
  // Candidate validated logical source tree hash.
  // Same full-tree SHA-256 hashing semantics as existing pack source identity.
  // Computed over the candidate source directory at planning time.
  sourceHash: string,

  // Showdar-owned installed pack files hash.
  // Computed over ONLY the files in the installed pack directory that are
  // listed in the manifest's owned path set for this pack.
  // Must NOT include unrelated foreign files.
  // Used to detect installed managed-file mutation between planning/execution.
  installedHash: string,

  // Normalized relevant extension entry hash.
  // Computed over a normalized projection of the manifest's extension state:
  //   { packs: [{name, version, source, hash}], customWorkflows: [{id, source, path}] }
  // NOT the entire manifest bytes.
  // Avoids unnecessary TOCTOU aborts from unrelated manifest changes
  // (e.g., unrelated pack metadata, instruction file paths).
  manifestHash: string,

  // Exact user-owned file bytes hash.
  // SHA-256 over the raw bytes of .showdar/overrides.json.
  // If overrides file is absent, overridesHash = null.
  // Exact bytes chosen because the file is user-owned and byte-preserved;
  // any byte change is a legitimate TOCTOU signal.
  overridesHash: string | null
}
```

### 10.3 Execution Rule

`executePackUpdate(plan)` recomputes all four fingerprint values immediately before mutation. If any differ from the plan's fingerprint:

```
Error: Plan is stale (<which-fingerprint> changed since preview).
Re-run: showdar update-pack <path> --dry-run
```

**No partial mutation.** The abort happens before any filesystem write.

### 10.4 Behavior When Components Disappear

| Condition | Detection | Result |
|-----------|-----------|--------|
| Source disappears | `sourceHash` recompute fails | Stale plan abort |
| Installed file disappears | `installedHash` recompute fails | Stale plan abort |
| Foreign file appears | Not detected (not in owned set) | Not a stale-plan signal |
| Manifest absent | `manifestHash` recompute fails | Stale plan abort |
| Overrides absent | `overridesHash` recompute returns null | Stale plan if plan had non-null |

### 10.5 Scope

- Only guards against external mutation between preview and execution
- Does NOT prevent concurrent `update-pack` executions (no locking — out of scope)
- Does NOT treat matching hash as trust/signature
- PlanFingerprint is **never persisted** in manifest or workflow state

---

## 11. Change Classification

### 11.1 Classification Model

Classification is an **ordered SET of categories** per change entry. One update can produce multiple categories. Each category is descriptive only — no semantic claims about behavior, compatibility, or safety.

### 11.2 Categories and Exact Semantics

| Category | Exact Meaning |
|----------|---------------|
| `source-only` | Source identity changed but NO catalog/runtime semantic resource changed. Exclusive with semantic categories. |
| `metadata` | `pack.json` metadata changed (version, description) with no skill/workflow/profile content change |
| `skill-content` | Skill `SKILL.md` or skill body files changed |
| `workflow-definition` | Custom workflow JSON definition changed (stages, skip rules, required stages, completion policy, `workflowStateCompat`) |
| `profile-definition` | Pack profile definition or member reference changed |
| `reference` | Broken or new cross-reference detected (profile member not in owned set, override references unknown workflow) |
| `ownership` | Ownership conflict detected (candidate file path collides with non-managed file) |
| `installed-drift` | Installed managed tree differs from recorded installation hash |

### 11.3 Deterministic Ordering

Categories within a single change entry are sorted alphabetically:

```
installed-drift, metadata, ownership, profile-definition, reference, skill-content, source-only, workflow-definition
```

### 11.4 `source-only` Exclusivity

`source-only` means: source identity changed but no catalog/runtime semantic resource changed. It MUST NOT be emitted together with `skill-content`, `workflow-definition`, `profile-definition`, or `reference`. If any semantic category applies, `source-only` is suppressed for that change entry.

### 11.5 Examples

| Change | Categories |
|--------|-------------|
| README.md edited | `["source-only"]` |
| pack.json version bump only | `["metadata"]` |
| SKILL.md edited | `["skill-content"]` |
| Workflow skip policy changed | `["workflow-definition"]` |
| Workflow changed + profile member added | `["workflow-definition", "reference"]` |
| Skill content + workflow definition both changed | `["skill-content", "workflow-definition"]` |
| README + workflow changed | `["source-only", "workflow-definition"]` — two separate change entries |
| Installed file mutated externally | `["installed-drift"]` |

### 11.6 No Category Means Compatibility

No category implies or claims checkpoint compatibility. Categories describe the change surface only.

---

## 12. Compatibility Explainability

### 12.1 CLI Surface

**Decision**: `inspect-pack <path> --checkpoint <file>` owns checkpoint compatibility explanation.

Rationale:
- `inspect-pack` already has `--json` and normalized output
- `doctor --extensions` is for installed-pack diagnostics, not ad-hoc checkpoint checking
- Avoids command proliferation

### 12.2 Output

When `--checkpoint` is supplied:
- Read checkpoint file
- Call `assessWorkflowCompatibility(checkpoint, catalog)`
- Output: compatible / workflow-incompatible / malformed
- Include: `replanRequired`, `category` (top-level error category), `reason` (deterministic code), `detail` (human message)
- Include: `affectedWorkflow`, `affectedStage` where determinable

### 12.3 Preserved Distinctions

- `source-drift` ≠ `workflow-incompatible`
- Invalid checkpoint ≠ valid `WorkflowState.status=BLOCKED`
- Malformed checkpoint ≠ `workflow-incompatible` (see §13)
- No authority exposure

---

## 13. Compatibility Reason Model

### 13.1 Malformed Checkpoint is NOT Workflow-Incompatible

**Critical distinction:**

| Condition | Top-Level Category | Reason Code |
|-----------|-------------------|-------------|
| Checkpoint JSON unparseable | `schema-invalid` | `malformed-checkpoint` |
| Checkpoint fails schema validation | `schema-invalid` | `malformed-checkpoint` |
| Workflow ID not in catalog | `workflow-incompatible` | `workflow-missing` |
| Selected stage not in workflow's stages | `workflow-incompatible` | `stage-removed` |
| Selected stage not in candidate stages | `workflow-incompatible` | `selected-stage-invalid` |
| Required stage not selected | `workflow-incompatible` | `required-stage-conflict` |
| Skipped stage reason/policy invalid | `workflow-incompatible` | `recorded-skip-invalid` |
| Skip rule not in workflow policy | `workflow-incompatible` | `skip-policy-invalid` |
| `workflowStateCompat.schemaVersion` ≠ 1 | `workflow-incompatible` | `workflow-state-compat-unsupported` |

**Rule:** Malformed input is NEVER reported as `workflow-incompatible`. The `malformed-checkpoint` reason code belongs to the `schema-invalid` category. A semantic compatibility verdict is only produced when the checkpoint first passes structural parsing and schema validation.

### 13.2 Semantic Compatibility Reason Codes (7 codes)

```js
// NEW in src/pack-compat.js — wraps existing validation, does NOT modify workflow-state.js
const COMPATIBILITY_REASONS = Object.freeze({
  WORKFLOW_MISSING: 'workflow-missing',
  STAGE_REMOVED: 'stage-removed',
  SELECTED_STAGE_INVALID: 'selected-stage-invalid',
  REQUIRED_STAGE_CONFLICT: 'required-stage-conflict',
  RECORDED_SKIP_INVALID: 'recorded-skip-invalid',
  SKIP_POLICY_INVALID: 'skip-policy-invalid',
  WORKFLOW_STATE_COMPAT_UNSUPPORTED: 'workflow-state-compat-unsupported',
});
```

### 13.3 Reason Precedence

When multiple validation failures exist, the first matching reason in this order is reported:

1. `workflow-missing` — workflow ID not found in catalog
2. `workflow-state-compat-unsupported` — `workflowStateCompat.schemaVersion` ≠ 1
3. `stage-removed` — selected stage not in workflow's declared stages
4. `selected-stage-invalid` — selected stage not in candidate stages
5. `required-stage-conflict` — required stage not selected
6. `skip-policy-invalid` — skip rule for stage not in workflow policy
7. `recorded-skip-invalid` — recorded skip reason/policy doesn't match current rule

### 13.4 Stability Policy

- Reason codes are **public JSON contract** (appear in `--json` output)
- Additive-only: new codes may be added; existing codes never change meaning
- `malformed-checkpoint` is always in `schema-invalid` category, never in `workflow-incompatible`
- Deterministic precedence ensures stable output for same input

### 13.5 Remediation Messages

| Reason | Message |
|--------|---------|
| `workflow-missing` | "Workflow no longer exists in the current candidate catalog." |
| `stage-removed` | "Selected stage is no longer declared by the workflow." |
| `selected-stage-invalid` | "Selected stage is not a valid candidate stage." |
| `required-stage-conflict` | "Required stage is not selected." |
| `recorded-skip-invalid` | "Recorded skip reason or policy is no longer accepted." |
| `skip-policy-invalid` | "Skip rule for stage is not in workflow policy." |
| `workflow-state-compat-unsupported` | "Checkpoint uses unsupported workflowStateCompat schema version." |
| `malformed-checkpoint` | "Checkpoint cannot be parsed or fails schema validation." |

---

## 14. Inspect UX

### 14.1 Improvements

1. **Remediation hints** — When drift detected, suggest `update-pack --dry-run`
2. **Source path display** — Show relative source path in output
3. **Workflow change detection** — When comparing installed vs source, show which workflows changed
4. **Override precedence** — When `--json`, include `computePrecedence()` output

### 14.2 New Flags

- `--checkpoint <file>` — Explain checkpoint compatibility (see §12)

### 14.3 Preserved

- `inspect-pack` remains read-only
- No `doctor --fix`
- No mutation from diagnostics
- v0.9 `inspect-pack --json` shape unchanged (see §3.5)

---

## 15. Doctor UX

### 15.1 Improvements

1. **`--json` flag** — Machine-readable output (see §7.4)
2. **Remediation hints** — When issues detected, suggest next steps
3. **Workflow definition health** — List custom workflows with validity status

### 15.2 Doctor Does NOT Claim Checkpoint Compatibility

Without a concrete checkpoint, doctor CANNOT truthfully report `compatible` or `incompatible`. Doctor reports:

- `checkpointCompatibility: "not-assessed"` — always, when no checkpoint supplied
- Workflow definition health (valid/invalid against schema)
- Workflow definitions changed relative to installed/source state
- Warning: "checkpoints may require revalidation" when workflow definitions changed

**`inspect-pack --checkpoint` owns compatibility explanation. Doctor does NOT accept a checkpoint flag.**

### 15.3 New Flags

- `--json` — Structured output

### 15.4 Preserved

- `doctor` remains read-only
- No `doctor --fix`
- Exit code 1 when unhealthy

---

## 16. List UX

### 16.1 Human Output (improved)

```
Packs:
  my-pack@0.2.0  healthy  hash:def456...

Custom workflows:
  my-flow  [pack:my-pack]  valid

Pack profiles:
  my-profile  [pack:my-pack]  members: my-skill, my-flow

Project overrides: valid
```

### 16.2 New Flags

- `--json` — Structured output (see §7.3)

### 16.3 Status Values

| Status | Meaning |
|--------|---------|
| `healthy` | No drift, validation passes |
| `source-drift` | Source hash differs from recorded |
| `installed-drift` | Installed files differ from recorded |
| `source-unavailable` | Source directory missing |
| `conflict` | Ownership conflict detected |

---

## 17. JSON Contract

### 17.1 Decision: OPTION 1 — Preserve v0.9, Envelope for New Surfaces Only

**Existing v0.9 JSON commands preserve their current JSON shape in 0.10. The common envelope is used ONLY for new 0.10 surfaces.**

| Command | JSON Shape | Status |
|---------|-----------|--------|
| `validate-pack --json` | `{ ok, errors }` | **Existing/Stable — unchanged** |
| `inspect-pack --json` | Full inspection model | **Existing/Stable — unchanged** |
| `update-pack --dry-run --json` | Common envelope | **New in 0.10** |
| `inspect-pack --checkpoint --json` | Common envelope | **New in 0.10** |
| `list --extensions --json` | Common envelope | **New in 0.10** |
| `doctor --extensions --json` | Common envelope | **New in 0.10** |

### 17.2 Common Envelope (New Surfaces Only)

```json
{
  "schemaVersion": 1,
  "command": "<command-name>",
  "ok": true,
  "data": { ... },
  "warnings": [],
  "errors": []
}
```

### 17.3 schemaVersion

- **CLI JSON schemaVersion 1** — separate from manifest v2 and workflow-state schemaVersion 1
- Additive-only: new fields may be added to `data`; existing fields never change meaning
- Bumped only on breaking change (requires minor version bump)
- NEVER applied retroactively to v0.9 `validate-pack --json` or `inspect-pack --json`

### 17.4 Deterministic Ordering

- Arrays sorted by natural key (name, id, path)
- No timestamps in output (except `installedAt` in pack metadata)
- No absolute paths (all paths relative to project root)

### 17.5 Error Representation

```json
{
  "schemaVersion": 1,
  "command": "update-pack",
  "ok": false,
  "data": null,
  "warnings": [],
  "errors": [
    {
      "category": "schema-invalid",
      "code": "SCHEMA_INVALID",
      "message": "Schema validation failed",
      "details": { "field": "name" }
    }
  ]
}
```

### 17.6 Exit Code Relationship

| Exit Code | Meaning |
|-----------|---------|
| 0 | Command executed successfully (including diagnostics that find problems) |
| 1 | Command execution failure (validation failed, stale plan, ownership conflict) |
| 2 | Usage error (bad flags, missing args) |

**Policy:** A diagnostic command that successfully produces output (even if it finds problems) exits 0. A command that fails to produce output exits 1. This is consistent across human and JSON modes.

Examples:
- `doctor --extensions` finds source-drift → exit 0 (healthy: false in output)
- `inspect-pack --checkpoint` finds workflow-incompatible → exit 0 (assessment succeeded)
- `validate-pack` finds schema errors → exit 1 (validation failed)
- `update-pack --dry-run` finds ownership conflict → exit 1 (cannot execute)
- `update-pack` stale plan → exit 1 (execution failed)

---

## 18. Error Model

### 18.1 Decision

**Keep the 12 top-level categories stable.** Add `reason` subcode for compatibility errors.

### 18.2 Reason Subcode

Add `reason` field to compatibility error details:

```js
// Semantic incompatibility
{
  category: 'workflow-incompatible',
  code: 'WORKFLOW_INCOMPATIBLE',
  message: 'Workflow definition incompatible with checkpoint',
  details: {
    reason: 'recorded-skip-invalid',
    affectedWorkflow: 'my-flow',
    affectedStage: 'showdar-test'
  }
}

// Malformed checkpoint
{
  category: 'schema-invalid',
  code: 'SCHEMA_INVALID',
  message: 'Schema validation failed',
  details: {
    reason: 'malformed-checkpoint'
  }
}
```

### 18.3 Preserved Distinctions

- `drift-detected` ≠ `workflow-incompatible` ≠ `schema-invalid`
- `malformed-checkpoint` (schema-invalid) ≠ `workflow-incompatible`
- No collapsing into generic error

---

## 19. Authoring UX

### 19.1 Scaffold Reduction Contract

The generated skill MUST:
- Pass all current validation (meaningful description, required headings, namespace)
- Be immediately installable
- Contain no filler solely to satisfy validator
- Be the smallest useful maintainable valid scaffold

The generated skill SHOULD include:
- YAML frontmatter with `name` and `description`
- `## Purpose` section
- `## When to use` section with bullet list
- `## When not to use` section with bullet list
- `## Non-negotiable rules` section with bullet list

The generated skill SHOULD NOT include:
- Empty placeholder sections with no guidance
- Repetitive boilerplate that adds no authoring value
- Sections that exist only to fill line count

### 19.2 Workflow Template Improvements

- Add `$schema` hint to generated workflow JSON
- Add comment in `pack.json` pointing to schema
- Generate canonical `allowedSkips` example with all valid reasons

### 19.3 Validation Guidance

After `create-pack`, print:
```
Pack scaffolded at: <path>
Validate: showdar validate-pack <path>
Inspect: showdar inspect-pack <path>
```

### 19.4 Preserved

- Default scaffold remains minimal
- No large boilerplate starter project
- No interactive wizard
- Existing v0.9 packs remain valid unchanged (no schema migration, no rewrite)

---

## 20. Custom Eval UX

### 20.1 Decision

**Keep npm/script-only. Improve docs. No CLI command.**

Rationale:
- Custom eval is intentionally separate from release-gating built-in benchmark
- Adding CLI command implies official support level not yet warranted
- `npm run eval:custom-workflows` is sufficient for opt-in usage
- Built-in benchmark remains closed (16 scenarios, M1-M10)

### 20.2 Improvement

Add a `README` section explaining:
- How to run custom eval
- How to generate fixtures
- Why it's separate from `npm run eval`

---

## 21. Source Location / Relink

### 21.1 Decision

**DEFER to 1.0+.**

Rationale:
- No concrete unmet requirement after 0.9/0.10 improvements
- `update-pack --dry-run` reduces need for relink (can preview from new location)
- Relink introduces complexity: identity verification, hash comparison, override preservation
- If needed in future: `showdar relink-pack <name> <path>` with validation, no installed-file mutation, preserve overrides

### 21.2 Current Behavior (preserved)

- Source path stored in `.showdar.json` as relative path
- If source missing: `source-unavailable` drift status
- User must manually fix or re-install

---

## 22. Pack Lock Decision

### 22.1 Decision

**REJECT.**

Rationale:
- Manifest v2 already provides identity via name/version/source/hash
- A lock would duplicate manifest data
- Multi-file consistency problems (lock + manifest + installed files)
- Would require manifest v3
- No concrete unmet requirement

---

## 23. Tarball Decision

### 23.1 Decision

**DEFER to 1.0+.**

Rationale:
- No actual user need after create/update improvements
- Secure extraction is complex: traversal, symlinks, hardlinks, devices, duplicate paths, case collisions, archive bombs, wrapper-directory semantics
- Temp extraction cleanup
- Logical-tree hashing for directory vs archive hash identity
- Ownership lifecycle
- Too large for 0.10 scope

### 23.2 Future Principle

Same logical pack tree → same computed pack source hash, regardless of transport.

---

## 24. Authority Boundary

### 24.1 Absolute Freeze

Phase 6G remains sole authority adjudicator.

Extension features may NOT add:
- authority, capability, mutation permission
- evidence kind, evidence quality
- AuthorizedAction, routing authority
- resolver hooks, projector hooks

Do not change:
- Public Intent 7 keys
- Phase 6G semantics
- `FORBIDDEN_AUTHORITY_KEYS` semantics

Environment/source location never grants authority.

---

## 25. Workflow-State Boundary

### 25.1 Freeze

- `schemaVersion` remains **1**
- WorkflowState remains **14 keys**
- Do NOT persist: pack hash, workflow definition hash, catalog snapshot, extension version, compatibility result
- Compatibility remains **ephemeral**
- **`src/workflow-state.js` is NOT modified in 0.10**

### 25.2 If SchemaVersion 2 Needed

STOP that feature and document as future work. Do not redesign schemaVersion 2 inside 0.10.

---

## 26. Manifest Boundary

### 26.1 Freeze

- Manifest **v2** remains valid
- Additive optional data only if actually necessary
- No manifest v3
- No migration
- Existing 0.9.0 projects work unchanged

---

## 27. Backward Compatibility

### 27.1 Preserved

- v0.9 projects
- manifest v2
- installed packs
- project overrides
- v0.9 custom workflows
- schemaVersion 1 checkpoints
- current extension hash
- 12 top-level error categories
- existing CLI commands and semantics
- **v0.9 JSON output shapes (validate-pack --json, inspect-pack --json)**

### 27.2 No Migration Required

All 0.10 features are additive. Existing `.showdar.json` files work unchanged. Existing v0.9 CLI JSON consumers see no change.

---

## 28. Security / Threat Model

### 28.1 Dry-Run Safety

- Read-only: no writes, no copies, no deletions
- No manifest mutation
- No override mutation
- No network access

### 28.2 Update Execution Safety (preserved from 0.9)

- Candidate validate before mutation
- Candidate catalog validate before mutation
- Ownership conflict fail loud
- Foreign files preserved
- Overrides preserved
- Staged replacement
- Rollback/failure safety
- Manifest updated last
- No network
- No executable hooks

### 28.3 TOCTOU Protection

- Plan fingerprint recheck before execution
- Abort if source/manifest/overrides changed since preview
- No partial mutation

### 28.4 No New Attack Surface

- No new transport mechanism
- No executable code
- No authority expansion
- No remote access

---

## 29. Test Strategy

### 29.1 Update Preview Tests

| Test | Description |
|------|-------------|
| same-hash | Preview reports "already up-to-date" |
| docs-only | Preview classifies as `source-only` |
| workflow-change | Preview classifies as `workflow-definition` |
| skill-add | Preview reports skill addition |
| skill-remove | Preview reports skill removal |
| profile-add | Preview reports profile addition |
| profile-remove | Preview reports profile removal |
| ownership-conflict | Preview reports conflict, `executable: false` |
| installed-drift | Preview reports installed drift |
| invalid-candidate | Preview reports validation error |
| broken-references | Preview reports broken references |
| no-mutation | Verify no files changed after `--dry-run` |
| preview-execution-parity | Same plan for preview and execution |
| TOCTOU-invalidation | Modify source between preview and execution → abort |

### 29.2 Compatibility Explain Tests

| Test | Description |
|------|-------------|
| valid | Compatible checkpoint |
| malformed | Malformed JSON → `schema-invalid` / `malformed-checkpoint` |
| workflow-removed | Workflow ID not in catalog → `workflow-incompatible` / `workflow-missing` |
| stage-removed | Stage not in workflow → `stage-removed` |
| required-changed | Required stage conflict → `required-stage-conflict` |
| invalid-skip | Skip reason/policy invalid → `recorded-skip-invalid` |
| source-drift-independent | Source drift ≠ incompatibility |
| deterministic-codes | Reason codes are stable |
| reason-precedence | Multiple failures → first match in precedence order |

### 29.3 JSON Tests

| Test | Description |
|------|-------------|
| deterministic-ordering | Same input → same output |
| stable-envelope | Envelope shape is stable for new surfaces only |
| v0.9-validate-json-unchanged | `validate-pack --json` output matches v0.9 fixture |
| v0.9-inspect-json-unchanged | `inspect-pack --json` output matches v0.9 fixture |
| stable-error-categories | 12 categories unchanged |
| no-stack-leakage | No stack traces in JSON |
| plan-projection-no-internal-leak | Internal plan fields absent from CLI JSON |

### 29.4 List Tests

| Test | Description |
|------|-------------|
| healthy | No drift |
| drifted | Source drift |
| unavailable | Source missing |
| conflict | Ownership conflict |
| overrides | Override status |

### 29.5 Authoring Tests

| Test | Description |
|------|-------------|
| generated-workflow-valid | `create-pack --with-workflow` produces valid workflow |
| skip-examples-valid | Generated skip examples pass validation |
| namespace-rules | Vendor/skill namespace rules enforced |
| scaffold-validates | Generated skill passes `validate-pack` |
| scaffold-installable | Generated skill passes `add-pack` |

### 29.6 TOCTOU Tests

| Test | Description |
|------|-------------|
| source-changes-after-plan | Modify source between preview and execution → abort, zero mutation |
| installed-owned-file-changes | Modify installed managed file → abort |
| manifest-relevant-change | Modify extension entry in manifest → abort |
| manifest-unrelated-change | Modify unrelated manifest field → NOT stale |
| overrides-bytes-change | Modify overrides.json bytes → abort |
| foreign-ownership-appears | Foreign file appears after plan → abort |
| stale-plan-zero-mutation | Verify no files changed after stale abort |

### 29.7 Doctor Tests

| Test | Description |
|------|-------------|
| no-checkpoint-compatibility-unknown | Doctor without checkpoint → `checkpointCompatibility: "not-assessed"` |

### 29.8 Relink Tests (if accepted)

N/A — relink deferred.

### 29.9 Tarball Tests (if accepted)

N/A — tarball deferred.

---

## 30. Dogfood Plan

Use a generated local pack (not an untracked mandatory fixture).

| Step | Action | Expected |
|------|--------|----------|
| 1 | `create-pack ./dogfood-pack --vendor test --with-workflow flow` | Pack scaffolded, validates |
| 2 | `add-pack ./dogfood-pack` | Pack installed |
| 3 | `inspect-pack ./dogfood-pack` | Valid pack |
| 4 | `doctor --extensions` | Healthy |
| 5 | Edit README.md | — |
| 6 | `update-pack ./dogfood-pack --dry-run` | Preview: `source-only` change |
| 7 | Verify classification | `["source-only"]`, no compatibility claim without checkpoint |
| 8 | Edit workflow skip policy | — |
| 9 | `update-pack ./dogfood-pack --dry-run` | Preview: `workflow-definition` change |
| 10 | Verify classification | `["workflow-definition"]`, no blanket checkpoint claim |
| 11 | Supply old checkpoint to `inspect-pack --checkpoint` | `workflow-incompatible` / `recorded-skip-invalid` |
| 12 | Supply malformed checkpoint | `schema-invalid` / `malformed-checkpoint`, NOT `workflow-incompatible` |
| 13 | `update-pack ./dogfood-pack` | Update executed |
| 14 | `doctor --extensions` | Healthy, `checkpointCompatibility: "not-assessed"` |
| 15 | Move source directory | — |
| 16 | `doctor --extensions` | Source unavailable |
| 17 | Edit candidate source, then `update-pack` | Stale plan abort, zero mutation |
| 18 | Add project override for workflow policy, re-run `inspect-pack --checkpoint` | Assessment uses effective candidate catalog including override |
| 19 | `remove-pack dogfood-pack` | Pack removed |

No network.

---

## 31. Implementation Sequence

### Phase A: Core Planning
1. Create `src/pack-plan.js` — `planPackUpdate()` function
2. Add `ExtensionChangePlan` model + `PlanFingerprint`
3. Add `executePackUpdate(plan)` — precondition verification + mutation

### Phase B: Dry-Run
4. Add `--dry-run` flag to `update-pack` in `bin/showdar.js`
5. Implement public dry-run projection (NOT direct internal serialization)
6. Add change classification logic

### Phase C: Compatibility Reason Model
7. Create `src/pack-compat.js` — `COMPATIBILITY_REASONS` + `assessCompatibilityReasons()`
8. Wrap existing `assessWorkflowCompatibility()` to return reason codes (does NOT modify `workflow-state.js`)
9. Add `--checkpoint` flag to `inspect-pack`

### Phase D: JSON Contract
10. Add common JSON envelope helper for new surfaces only
11. Add `--json` to `doctor --extensions`
12. Add `--json` to `list --extensions`
13. Update `listExtensions()` to return full status

### Phase E: Authoring
14. Reduce `SKILL_TEMPLATE` to minimal valid scaffold
15. Add validation guidance output to `create-pack`

### Phase F: Tests
16. Add `test/extensions-10.test.js`
17. Add v0.9 JSON backward-compat fixture tests

### Phase G: Docs
18. Update `README.md`
19. Update `CHANGELOG.md`

### Phase H: Dogfood
20. Execute dogfood plan (§30)

---

## 32. Files / Modules Likely Affected

| File | Change |
|------|--------|
| `src/pack-plan.js` | **NEW** — `planPackUpdate()`, `ExtensionChangePlan`, `PlanFingerprint`, `executePackUpdate()` |
| `src/pack-compat.js` | **NEW** — `COMPATIBILITY_REASONS`, `assessCompatibilityReasons()` |
| `src/pack-update.js` | Refactor to use `planPackUpdate()` + `executePackUpdate()` |
| `src/pack-inspect.js` | Add `--checkpoint` support, remediation hints |
| `src/pack-scaffold.js` | Reduce `SKILL_TEMPLATE`, add guidance output |
| `src/project.js` | Update `listExtensions()` to return full status |
| `src/extension-errors.js` | Add `reason` subcode support |
| `bin/showdar.js` | Add `--dry-run`, `--checkpoint`, `--json` flags |
| `test/extensions-10.test.js` | **NEW** — 0.10 tests |
| `test/extensions-09-json-compat.test.js` | **NEW** — v0.9 JSON backward-compat fixtures |
| `README.md` | Update CLI docs |
| `CHANGELOG.md` | Add 0.10 entry |

### Files NOT Modified

- `src/workflow-state.js` — **NOT modified** (compatibility wrapping is external)
- `src/evidence-state.js` — NOT modified
- `src/workflow-trace.js` — NOT modified
- `src/adapters.js` — NOT modified
- `src/adapter-renderers.js` — NOT modified
- Phase 6G authority modules — NOT modified

---

## 33. Documentation Changes

- `README.md`: Add `update-pack --dry-run`, `inspect-pack --checkpoint`, `list --extensions --json`, `doctor --extensions --json`
- `CHANGELOG.md`: Add `[0.10.0]` section
- `INTENT-EXTENSIBILITY-DESIGN-0.10.md`: This document

---

## 34. Risks

| Risk | Mitigation |
|------|------------|
| TOCTOU race between preview and execution | Plan fingerprint recheck; abort if stale; zero mutation |
| Change classification misleads user | Categories are descriptive only; ordered set; no semantic claims |
| v0.9 JSON contract breakage | OPTION 1: envelope only for new surfaces; backward-compat fixture tests |
| Internal plan leaking to CLI JSON | Public projection is explicit curated subset; test verifies no leak |
| Scaffold reduction breaks existing packs | Only affects new `create-pack`; existing packs unchanged; scaffold must still validate |
| Compatibility reason codes incomplete | Additive-only; 7 semantic codes + 1 malformed; deterministic precedence |
| Doctor over-claiming compatibility | `checkpointCompatibility: "not-assessed"` without checkpoint |

---

## 35. Frozen Decisions

| # | Decision | Status |
|---|----------|--------|
| 1 | `update-pack --dry-run` | **IN** |
| 2 | Canonical change-plan model | **IN** — `src/pack-plan.js` (internal) |
| 3 | Preview/execution parity | **IN** — same `planPackUpdate()` + `executePackUpdate()` |
| 4 | TOCTOU handling | **IN** — plan fingerprint recheck, abort on stale |
| 5 | Change categories exposed | **IN** — ordered SET, descriptive only |
| 6 | Checkpoint compatibility via CLI | **IN** — `inspect-pack --checkpoint` |
| 7 | Command owning compatibility UX | **IN** — `inspect-pack` |
| 8 | Deterministic compatibility reason codes | **IN** — 7 semantic codes in `src/pack-compat.js` |
| 9 | `list --extensions --json` | **IN** — new envelope |
| 10 | Common CLI JSON envelope | **OPTION 1** — new surfaces only; v0.9 unchanged |
| 11 | 12 top-level error categories stable | **IN** — unchanged |
| 12 | `create-workflow` command | **DEFER** |
| 13 | Workflow/skip authoring improvements | **IN** — leaner scaffold, guidance |
| 14 | Custom eval CLI | **REJECT** — npm/script-only |
| 15 | Source relinking | **DEFER** to 1.0+ |
| 16 | Pack lockfile | **REJECT** |
| 17 | Local tarball support | **DEFER** to 1.0+ |
| 18 | Manifest version | **v2** — unchanged |
| 19 | Workflow-state schemaVersion | **1** — unchanged |
| 20 | WorkflowState shape | **14 keys** — unchanged |
| 21 | Compatibility results ephemeral | **YES** — not persisted |
| 22 | Trace event count | **10** — unchanged |
| 23 | Built-in 15/4/6 freeze | **YES** — unchanged |
| 24 | Deferred to 1.0+ | Tarball, relink, registry, marketplace, signing, plugins, remote install, GUI |
| 25 | `src/workflow-state.js` modified | **NO** — compatibility wrapping is external |
| 26 | Malformed checkpoint category | `schema-invalid` / `malformed-checkpoint` |
| 27 | Doctor compatibility wording | `checkpointCompatibility: "not-assessed"` without checkpoint |
| 28 | Classification model | Ordered SET per change entry, alphabetical sort |
| 29 | `source-only` exclusivity | Suppressed when any semantic category applies |
| 30 | Exit code for diagnostics finding problems | Exit 0 (command succeeded); exit 1 for execution failure |
| 31 | v0.9 JSON envelope | **NOT applied** — shapes preserved |

---

## 36. Deferred 1.0+ Work

- Tarball support (`.tgz` / `.tar.gz`)
- Source relinking (`relink-pack`)
- Registry / marketplace
- Git / URL / npm install
- Signing / trust roots
- Executable plugins / hooks
- GUI
- `create-workflow` command (if demand increases)
- Common envelope retrofit to v0.9 commands (breaking change, future major)

---

## 37. Acceptance Criteria

- [ ] No authority expansion
- [ ] No executable extension code
- [ ] No silent mutation from diagnostics
- [ ] Preview is read-only (no filesystem mutation)
- [ ] Update preview and execution share canonical planning (`planPackUpdate()`)
- [ ] Compatibility claims require actual checkpoint validation
- [ ] Source drift remains identity-only
- [ ] No pack-hash-as-behavior semantics
- [ ] No schema/state migration
- [ ] No manifest migration
- [ ] No built-in policy change
- [ ] Existing 0.9 users require no migration
- [ ] v0.9 `validate-pack --json` output unchanged (fixture test)
- [ ] v0.9 `inspect-pack --json` output unchanged (fixture test)
- [ ] Internal plan fields absent from CLI JSON (projection test)
- [ ] Malformed checkpoint → `schema-invalid` / `malformed-checkpoint`, NOT `workflow-incompatible`
- [ ] Doctor without checkpoint → `checkpointCompatibility: "not-assessed"`
- [ ] Stale plan → zero mutation
- [ ] All new public JSON/error/reason contracts are intentional
- [ ] `npm test` passes
- [ ] `npm run validate` passes
- [ ] Dogfood plan executed successfully

---

## 38. Required 0.10 Decisions (Explicit)

1. **Is `update-pack --dry-run` IN?** → **YES**
2. **Is there a canonical extension change-plan model?** → **YES** — `src/pack-plan.js` (internal)
3. **How is preview/execution parity guaranteed?** → **Same `planPackUpdate()` + `executePackUpdate()`**
4. **How is TOCTOU handled?** → **Plan fingerprint recheck before execution, abort on stale**
5. **Are change categories exposed?** → **YES** — ordered SET, descriptive only
6. **Is checkpoint compatibility explanation exposed via CLI?** → **YES** — `inspect-pack --checkpoint`
7. **Which existing command owns that UX?** → **`inspect-pack`**
8. **Are deterministic compatibility reason codes introduced?** → **YES** — 7 semantic codes in `src/pack-compat.js`
9. **Is `list --extensions --json` IN?** → **YES** — new envelope
10. **Is a common CLI JSON envelope/version IN?** → **OPTION 1** — new surfaces only; v0.9 unchanged
11. **Do the 12 top-level extension error categories remain stable?** → **YES**
12. **Is `create-workflow` IN/DEFER/REJECT?** → **DEFER**
13. **What improves workflow/skip authoring?** → **Leaner scaffold, validation guidance, canonical skip examples**
14. **Does custom eval get a CLI?** → **NO** — npm/script-only
15. **Is source relinking needed?** → **DEFER** to 1.0+
16. **Is a pack lockfile needed?** → **REJECT**
17. **Is local tarball support IN or DEFERRED?** → **DEFERRED** to 1.0+
18. **Does manifest stay v2?** → **YES**
19. **Does workflow-state stay schemaVersion 1?** → **YES**
20. **Does WorkflowState remain 14 keys?** → **YES**
21. **Are compatibility results still ephemeral?** → **YES**
22. **Does trace remain 10 events?** → **YES**
23. **Are 15/4/6 built-ins frozen?** → **YES**
24. **What is explicitly deferred to 1.0+?** → **Tarball, relink, registry, marketplace, signing, plugins, remote install, GUI**
25. **Is `src/workflow-state.js` modified?** → **NO** — compatibility wrapping is external (`src/pack-compat.js`)
26. **Malformed checkpoint mapping?** → **`schema-invalid` / `malformed-checkpoint`** — NOT `workflow-incompatible`
27. **Doctor compatibility wording?** → **`checkpointCompatibility: "not-assessed"`** without checkpoint
28. **Classification model?** → **Ordered SET, alphabetical sort, `source-only` exclusive with semantic categories**
29. **`source-only` exact meaning?** → **Source identity changed but no catalog/runtime semantic resource changed**
30. **Exit code for diagnostics finding problems?** → **Exit 0** (command succeeded); exit 1 for execution failure
31. **v0.9 JSON envelope?** → **NOT applied** — shapes preserved

---

## 39. Public vs Internal Contracts

### PUBLIC (CLI contracts introduced in 0.10)

- `update-pack --dry-run` flag
- `update-pack --dry-run --json` output (common envelope)
- `inspect-pack --checkpoint` flag
- `inspect-pack --checkpoint --json` output (common envelope)
- `list --extensions --json` output (common envelope)
- `doctor --extensions --json` output (common envelope)
- 7 semantic compatibility reason codes
- `malformed-checkpoint` reason code (in `schema-invalid` category)
- `checkpointCompatibility: "not-assessed"` field in doctor output

### INTERNAL (NOT public, may evolve without CLI contract change)

- `ExtensionChangePlan` full shape
- `PlanFingerprint` representation
- Internal diff structures (files add/replace/remove)
- Filesystem staging representation
- Validator exception text
- `src/pack-compat.js` internal assessment logic

---

**Unresolved decisions: NONE**

**SHOWDAR_0_10_DESIGN_FINAL_FROZEN**
