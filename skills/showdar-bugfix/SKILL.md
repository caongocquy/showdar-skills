---
name: showdar-bugfix
description: Use when resolving an observed defect end-to-end, adaptively sequencing understand, debug, build, test, and review stages based on whether root cause is already proven.
---

# Showdar Bugfix

## Purpose

- Resolve an observed defect safely from evidence to verified fix.
- Include diagnosis only when the root cause is actually unknown.
- Skip implementation when the user asked only for investigation.
- Hand work to one primitive at a time; load the next only when needed.

## When to use

- The user asks to resolve a defect end-to-end.
- A failure is observed: crash, regression, wrong behavior, build failure, performance fault.
- Examples: "fix the login crash", "resolve the checkout regression".

## When not to use

- Single primitive intent stays primitive: "why does this crash" is `showdar-debug` unless the user asks to fix it end-to-end.
- Investigation-only requests stay at `showdar-debug`; do not force `showdar-build`.
- Interrupted or broken work-state recovery is `showdar-recover`, not this workflow; use recover only for work-state semantics, not ordinary bugs.
- Once this workflow is active, do not spawn another parent workflow unless the request contains a genuinely separate workflow task.
- This workflow never recursively invokes itself.

## Inputs and assumptions

- Observed failure and reproduction path, when available.
- Current repository conventions and change surface are discoverable.
- Authority comes from the existing Phase 6G engine; this workflow consumes authority results and never mints authority.
- Candidate stages: `showdar-understand`, `showdar-debug`, `showdar-build`, `showdar-test`, `showdar-review`.

## Non-negotiable rules

- Symptom description alone is not mutation authority.
- Do not treat a symptom as permission to edit; require root-cause evidence or explicit fix authorization.
- Investigation-only requests do not proceed to `showdar-build`.
- End-to-end fixes always include verification; never skip it to move faster.
- Stop when required evidence is missing instead of guessing.

## Workflow

### Phase 1 — determine needed stages

- Root cause unknown: `showdar-understand`, then `showdar-debug`, then `showdar-build`, then `showdar-test`, then `showdar-review`.
- Root cause already proven: `showdar-understand`, then `showdar-build`, then `showdar-test`, then `showdar-review`.
- Investigation only: `showdar-debug` alone, then report findings without mutation.

### Phase 2 — execute progressively

- Load one primitive at a time; hand off only when its stop condition is met.
- Each primitive's own SKILL.md governs its stage; do not copy primitive instructions here.
- Track portable workflow state (`src/workflow-state.js`): candidate stages, selected stages, active stage, completed evidence receipts, skipped stages with structured reason plus evidence plus policy, next stage or complete, status, revision.
- Checkpoint by serializing state to plain JSON; caller or harness owns persistence. No filesystem or backend store is implied.
- Interrupt explicitly to preserve completed plus skipped plus evidence state without inventing completion.
- Resume by validating the checkpoint, re-resolving current context through Phase 6G, checking workflow compatibility, then continuing or blocking with replan-required.
- Stored state never authorizes continuation; debug may be skipped only with proven root-cause evidence under policy, never from symptom description alone.
- Stage completion comes from primitive evidence and stop conditions; workflow completion requires root cause proven plus fix implemented plus verification plus review.

## Decision points

- Is the root cause proven with evidence? If yes, `showdar-debug` may be skipped.
- Did the user ask only for diagnosis? If yes, stop after `showdar-debug`.
- Is the failure actually interrupted work-state? If yes, hand off to `showdar-recover` instead.
- Auth, secrets, or exposure involved? Add `showdar-security` as an orthogonal specialist.

## Stack detection

- Defer to each selected primitive's own stack detection.

## Failure modes

- Editing from symptom description without root-cause evidence.
- Forcing implementation when only diagnosis was requested.
- Confusing ordinary bugs with work-state recovery.
- Loading all primitives eagerly instead of progressively.

## Stop conditions

- Stop when the request is actually a single primitive task and hand off to that primitive.
- Stop before destructive, irreversible, production, credential, publishing, or deployment actions unless explicitly authorized.
- Stop when required evidence is missing.
- Stop when the fix is verified and reviewed.

## Escalation conditions

- Ask for reproduction steps when the failure cannot be reproduced.
- Ask for explicit fix authority when evidence is thin.
- Escalate suspected security exposure with evidence, without exploit amplification.

## Verification

- Reproduce before and after where practical.
- End-to-end fixes include `showdar-test` evidence and `showdar-review` findings addressed.
- State what was executed and what remains unverified.

## Output contract

- Root-cause evidence and selected stages.
- Fix location and behavior change.
- Verification gaps or residual risk.

## Anti-patterns

- Symptom-to-patch without diagnosis.
- Mandatory debug stage even when the cause is proven.
- Mandatory build stage for investigation-only requests.
- Copying primitive SKILL.md content into this file.

## Example

**Checkout total regressed after discount change**

- Evidence: failure observed, root cause unknown.
- Selected: `showdar-understand`, then `showdar-debug` (isolated to discount ordering), then `showdar-build`, then `showdar-test`, then `showdar-review`.
- Investigation-only variant would stop after `showdar-debug` with findings and no mutation.
