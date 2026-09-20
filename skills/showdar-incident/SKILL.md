---
name: showdar-incident
description: Use when investigating and recovering from an active operational incident, adaptively sequencing understand, debug, recover, verification, and ops stages with strict mutation authority.
---

# Showdar Incident

## Purpose

- Handle an active operational failure or service-impacting incident.
- Diagnose before mutating when the cause is unknown.
- Recover work-state or service state through the right primitive.
- Keep production mutation strictly authority-gated regardless of severity.

## When to use

- The user asks to investigate or recover from an active operational incident.
- Service impact exists: outage, degraded service, failed deploy, data-risk event.
- Examples: "production API is down", "recover the failed deploy", "checkout is erroring in prod".

## When not to use

- Single primitive intent stays primitive: a narrow debug question without recovery intent is `showdar-debug`.
- Ordinary non-urgent bugs without operational impact belong to `showdar-bugfix`.
- Once this workflow is active, do not spawn another parent workflow unless the request contains a genuinely separate workflow task.
- This workflow never recursively invokes itself.

## Inputs and assumptions

- Incident symptoms, impact scope, and environment, when known.
- Current repository conventions and change surface are discoverable.
- Authority comes from the existing Phase 6G engine; this workflow consumes authority results and never mints authority.
- Candidate stages: `showdar-understand`, `showdar-debug`, `showdar-recover`, `showdar-test`, `showdar-ops`.

## Non-negotiable rules

- Diagnosis before speculative mutation when the cause is unknown.
- Emergency context does not erase authority boundaries.
- Production mutation is never inferred from severity alone.
- This workflow does NOT authorize production mutation by identity.
- `showdar-ops` loads only when explicit environment plus action authority permits it.
- This workflow never auto-deploys or restarts production from risk alone.
- A security incident may load `showdar-security` as an orthogonal specialist.
- Stop when required evidence or authority is missing instead of guessing.

## Workflow

### Phase 1 — determine needed stages

- Typical path: `showdar-understand`, then `showdar-debug`, then `showdar-recover`, then verification.
- Unknown cause: investigate first; no speculative mutation.
- Interrupted or broken work-state: use `showdar-recover` for work-state semantics.
- Verification uses `showdar-test` evidence or the relevant primitive's own verification.
- Add `showdar-ops` only with explicit environment plus action authority.

### Phase 2 — execute progressively

- Load one primitive at a time; hand off only when its stop condition is met.
- Each primitive's own SKILL.md governs its stage; do not copy primitive instructions here.
- Track portable workflow state (`src/workflow-state.js`): candidate stages, selected stages, active stage, completed evidence receipts, skipped stages with structured reason plus evidence plus policy, next stage or complete, status, revision.
- Checkpoint by serializing state to plain JSON; caller or harness owns persistence. No filesystem or backend store is implied.
- Interrupt explicitly to preserve completed plus skipped plus evidence state without inventing completion.
- Resume by validating the checkpoint, re-resolving current context through Phase 6G, checking workflow compatibility, then continuing or blocking with replan-required.
- Stored state never authorizes continuation; severity never grants production mutation, and ops loads only with explicit environment plus action authority.
- Stage completion comes from primitive evidence and stop conditions; workflow completion requires recovery plus verification per policy, not merely diagnosis.

## Decision points

- Is the cause known? If not, diagnose before any mutation.
- Is this work-state recovery or service recovery? Choose `showdar-recover` versus `showdar-ops` accordingly, gated by authority.
- Is explicit ops authority present? Without environment plus action permission, no ops step.
- Is this a security incident? If yes, add `showdar-security` as an orthogonal specialist.

## Stack detection

- Defer to each selected primitive's own stack detection.

## Failure modes

- Mutating production from severity or urgency alone.
- Auto-deploying or restarting from risk signals.
- Skipping diagnosis to "move fast" during an incident.
- Loading all primitives eagerly instead of progressively.

## Stop conditions

- Stop when the request is actually a single primitive task and hand off to that primitive.
- Stop before production mutation, deployment, restart, or rollback without explicit authority.
- Stop when required evidence is missing.
- Stop when recovery is verified or the incident is handed off with evidence.

## Escalation conditions

- Ask for environment plus action authority before any ops step.
- Ask for missing impact scope or logs when diagnosis is blocked.
- Escalate suspected security exposure with evidence, without exploit amplification.

## Verification

- Verify recovery with fresh evidence, not assumptions.
- State what was executed and what remains unverified.

## Output contract

- Diagnosis evidence and selected stages.
- Recovery actions taken, each with its authority basis.
- Verification gaps or residual risk.

## Anti-patterns

- Severity granting mutation authority.
- Risk signals triggering auto-remediation.
- Second authority engine or second intent resolver.
- Copying primitive SKILL.md content into this file.

## Example

**Production checkout erroring after deploy**

- Evidence: active incident, cause unknown, no ops authority stated.
- Selected: `showdar-understand`, then `showdar-debug`, then `showdar-recover` for work-state triage, then verification.
- Skipped: `showdar-ops` (no explicit environment plus action authority).
- Output: diagnosis evidence, recovery state, and the exact authority needed for any production action.
