---
name: showdar-feature
description: Use when implementing a complete feature end-to-end, adaptively sequencing understand, requirements, plan, design, build, test, and review stages based on existing definition.
---

# Showdar Feature

## Purpose

- Implement a complete feature end-to-end by sequencing primitive skills.
- Select only the stages the current evidence actually requires.
- Skip defined, trivial, or decision-free stages instead of running a fixed pipeline.
- Hand work to one primitive at a time; load the next primitive only when needed.

## When to use

- The user asks to implement a complete feature or change spanning multiple lifecycle stages.
- Whole-task intent exists: discovery plus definition plus implementation plus verification.
- Examples: "add user search", "implement checkout flow", "build the export feature".

## When not to use

- Single primitive intent stays primitive: "review this diff" stays `showdar-review`, "run tests" stays `showdar-test`, "why does this crash" stays `showdar-debug` unless the user asks to fix it end-to-end.
- A request that is only diagnosis, only planning, or only review is not this workflow.
- Once this workflow is active, do not spawn another parent workflow unless the request contains a genuinely separate workflow task.
- This workflow never recursively invokes itself.

## Inputs and assumptions

- User outcome in their own words.
- Current repository conventions and change surface are discoverable.
- Authority comes from the existing Phase 6G engine; this workflow consumes authority results and never mints authority.
- Candidate stages: `showdar-understand`, `showdar-requirements`, `showdar-plan`, `showdar-design`, `showdar-build`, `showdar-test`, `showdar-review`.

## Non-negotiable rules

- This workflow does not grant extra authority. Deployment requires explicit authority.
- Ops is NOT implied by feature work.
- Never skip verification merely to move faster.
- Security may load as an orthogonal primitive (`showdar-security`) when the change touches auth, secrets, trust boundaries, or exposure.
- Stop when required evidence is missing instead of guessing.

## Workflow

### Phase 1 — determine needed stages

- Start with `showdar-understand` when the repository, architecture, or impact is unfamiliar.
- Skip requirements if behavior is already sufficiently defined.
- Skip plan for genuinely focused or local work.
- Skip design when no meaningful architecture, UX, or interface decision exists.
- Small well-defined change: understand, then `showdar-build`, then `showdar-test`, then `showdar-review`.
- Undefined feature: understand, then `showdar-requirements`, then `showdar-plan`, then `showdar-build`, then `showdar-test`, then `showdar-review`.
- Architecture or UI-sensitive feature: understand, then `showdar-requirements`, then `showdar-plan`, then `showdar-design`, then `showdar-build`, then `showdar-test`, then `showdar-review`.

### Phase 2 — execute progressively

- Load one primitive at a time; hand off only when its stop condition is met.
- Each primitive's own SKILL.md governs its stage; do not copy primitive instructions here.
- Track ephemeral state only: candidate stages, selected stages, active stage, completed evidence, next stage or complete.
- No persistent checkpoint or resume infrastructure in this version.

## Decision points

- Behavior defined already? Skip `showdar-requirements`.
- Change surface local and low-risk? Skip `showdar-plan`.
- No architecture, UX, or interface trade-off? Skip `showdar-design`.
- Auth, secrets, or exposure touched? Add `showdar-security` as an orthogonal specialist.
- Deployment requested? Require explicit authority; this workflow alone never authorizes it.

## Stack detection

- Defer to each selected primitive's own stack detection.

## Failure modes

- Running every stage as a mandatory checklist.
- Duplicating primitive instructions inside this workflow.
- Treating feature intent as deployment authority.
- Loading all primitives eagerly instead of progressively.

## Stop conditions

- Stop when the request is actually a single primitive task and hand off to that primitive.
- Stop before destructive, irreversible, production, credential, publishing, or deployment actions unless explicitly authorized.
- Stop when required evidence is missing.
- Stop when the selected stages are complete and verified.

## Escalation conditions

- Ask for missing behavior definition when requirements cannot be skipped honestly.
- Ask for explicit authority when deployment or production mutation appears.
- Escalate suspected security exposure with evidence, without exploit amplification.

## Verification

- Every implementation stage ends with `showdar-test` evidence and `showdar-review` findings addressed.
- State what was executed and what remains unverified.

## Output contract

- Selected stages with one-line justification for each skipped stage.
- Completed evidence per stage.
- Verification gaps or residual risk.

## Anti-patterns

- Fixed pipeline regardless of evidence.
- Second authority engine or second intent resolver.
- Custom autonomous agent behavior.
- Copying primitive SKILL.md content into this file.

## Example

**Add workspace member search**

- Evidence: behavior already defined in the ticket, local API plus UI change, no architecture trade-off.
- Selected: `showdar-understand`, then `showdar-build`, then `showdar-test`, then `showdar-review`.
- Skipped: requirements (defined), plan (local), design (no UX decision).
- Verification: new search tests pass; review findings addressed.
