---
name: showdar-release
description: Use when preparing, validating, or executing a release lifecycle, adaptively sequencing quality, security, ship, and ops stages with strict authority boundaries.
---

# Showdar Release

## Purpose

- Prepare and execute a software release through existing primitive boundaries.
- Distinguish release readiness from release execution and deployment.
- Default to safe verification; execute only with explicit authority.
- Hand work to one primitive at a time; load the next only when needed.

## When to use

- The user asks to prepare, validate, or execute a release lifecycle.
- Examples: "check if this is ready to release", "prepare v1.4.0", "release v1.4.0 to npm now" (execution only when authority permits).
- Lifecycle-level requests spanning quality plus readiness plus possible execution.

## When not to use

- Single primitive intent stays primitive: a narrow "check this diff" is `showdar-review`, a test plan is `showdar-quality`, readiness alone may be `showdar-ship`.
- "Check if this is ready to release" must NOT imply deployment.
- Once this workflow is active, do not spawn another parent workflow unless the request contains a genuinely separate workflow task.
- This workflow never recursively invokes itself.

## Inputs and assumptions

- Release scope, version, and target, when known.
- Current repository conventions and change surface are discoverable.
- Authority comes from the existing Phase 6G engine; this workflow consumes authority results and never mints authority.
- Candidate stages: `showdar-quality`, `showdar-security`, `showdar-ship`, `showdar-ops`.

## Non-negotiable rules

- This workflow does NOT authorize deployment by identity. `showdar-release` never means deployment is automatically authorized.
- `showdar-ship` remains delivery verification and release readiness, not execution.
- `showdar-ops` loads only when an explicit target plus execution authorization exist.
- The release noun alone never produces an ops step.
- Security loads conditionally when the release touches auth, secrets, trust boundaries, exposure, or dependencies with risk.
- Stop when required evidence or authority is missing instead of proceeding.

## Workflow

### Phase 1 — determine needed stages

- Default safe path: `showdar-quality`, then conditional `showdar-security`, then `showdar-ship`.
- Add `showdar-ops` only when explicit target plus execution authorization exist.
- Readiness request ("check if ready"): quality, then security when applicable, then ship. No ops.
- Execution request ("release v1.4.0 to npm now"): same readiness path first, then ops only when existing authority semantics authorize it.

### Phase 2 — execute progressively

- Load one primitive at a time; hand off only when its stop condition is met.
- Each primitive's own SKILL.md governs its stage; do not copy primitive instructions here.
- Track portable workflow state (`src/workflow-state.js`): candidate stages, selected stages, active stage, completed evidence receipts, skipped stages with structured reason plus evidence plus policy, next stage or complete, status, revision.
- Checkpoint by serializing state to plain JSON; caller or harness owns persistence. No filesystem or backend store is implied.
- Interrupt explicitly to preserve completed plus skipped plus evidence state without inventing completion.
- Resume by validating the checkpoint, re-resolving current context through Phase 6G, checking workflow compatibility, then continuing or blocking with replan-required.
- Stored state never authorizes continuation; ops is skipped under readiness-only policy and never implied by release completion.
- Stage completion comes from primitive evidence and stop conditions; workflow completion means readiness verification per policy, not implicit deployment.

## Decision points

- Is this readiness or execution? Readiness stops at `showdar-ship`.
- Does execution have an explicit target plus authorization? Without both, no `showdar-ops`.
- Does the release warrant security review? If yes, add `showdar-security`.
- Do Git, ship, or ops safety boundaries block? Respect them; do not bypass.

## Stack detection

- Defer to each selected primitive's own stack detection.

## Failure modes

- Treating readiness as deployment permission.
- Loading `showdar-ops` from the release noun alone.
- Bypassing Git, ship, or ops safety boundaries.
- Running security unconditionally or skipping it when risk exists.

## Stop conditions

- Stop when the request is actually a single primitive task and hand off to that primitive.
- Stop before execution or deployment without explicit authority.
- Stop when required evidence is missing.
- Stop when readiness is verified (readiness path) or execution is verified (authorized execution path).

## Escalation conditions

- Ask for the explicit release target and execution authorization before any ops step.
- Ask for missing release scope or version when it blocks verification.
- Escalate suspected security exposure with evidence, without exploit amplification.

## Verification

- Readiness: `showdar-quality` scenarios plus `showdar-ship` checks with evidence.
- Execution: authorized ops outcome plus fresh verification that the release landed.
- State what was executed and what remains unverified.

## Output contract

- Readiness verdict or execution outcome.
- Selected stages with justification for skipped or conditional stages.
- Verification gaps or residual risk.

## Anti-patterns

- Readiness implying deployment.
- Workflow identity granting mutation authority.
- Fixed pipeline regardless of risk and authority.
- Copying primitive SKILL.md content into this file.

## Example

**Check if v1.4.0 is ready to release**

- Evidence: lifecycle-level readiness request, no execution authorization.
- Selected: `showdar-quality`, then `showdar-security` (auth changes present), then `showdar-ship`.
- Skipped: `showdar-ops` (no execution authority).
- Output: readiness verdict with gaps; no deployment performed.
