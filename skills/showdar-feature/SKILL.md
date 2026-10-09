---
name: showdar-feature
description: Use when implementing a complete feature end-to-end, adaptively sequencing understand, requirements, plan, design, build, test, and review stages based on existing definition.
---

# Showdar Feature

## Mandatory Git preflight for task-owned writes

Before any task-owned source/config/test/docs write, apply `showdar-git` branch policy: on develop/main/integration, inspect repository conventions and EXECUTE `showdar git-start --type <type> --name "<task>"` to prepare the task branch before editing. Then run `showdar guard --mutation local-write --json` and require `ok=true` and `data.allowed=true` before ANY file-writing tool. If blocked, STOP before editing. On an existing task branch run guard without creating a new branch. Recheck when a read-only stage turns into a write. If CLI is missing, manually prepare and verify safe Git branch state; do not silently write on develop/main. Explicit documented direct-work policy wins; never infer stash, reset, commit, merge, or push.


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

## Conditional refinement gate (portable)

- Before selecting implementation stages, assess whether the requested feature has material unresolved product, permission, state, data, or architecture decisions.
- If the request is sufficiently defined, skip refinement with a concrete evidence reason; never force an interview for a local, low-risk or already approved change.
- If materially unclear and the optional `showdar-brainstorm` companion is installed, invoke it before implementation; ask one high-impact question at a time and produce a Decision Brief.
- If the companion is missing, report it rather than claiming it ran; resolve blocking decisions with the user before continuing.
- When refinement has been triggered, wait for explicit user approval of the *whole* proposed spec revision before entering `showdar-build`.
- Carry approved decisions, non-goals, acceptance notes, unresolved questions and evidence into requirements/plan/design without repeating already answered questions.
- Use the existing canonical spec/ticket when present; persist a new `docs/showdar/specs/` document only for durable or complex handoff after approval.
- If later repository evidence contradicts an approved decision, reopen only the affected decision and obtain revision-specific approval.
- Refer to installed `showdar-domain-model` for meaningful shared terminology or accepted architectural decisions, not as a required lifecycle stage.
- This decision gate is portable guidance, not a new router, workflow-state stage, checkpoint authority, or implicit permission to mutate files.

## Adaptive TDD companion

- `showdar-tdd` is an optional companion for the `showdar-build` implementation loop, not a new candidate stage or workflow-state schema field.
- For behavior changes with runnable tests, Build should hand the smallest task and acceptance criteria to TDD, retain RED/GREEN/REFACTOR receipts and follow with `showdar-test` and `showdar-review`.
- If TDD cannot run, record why and use task-appropriate alternate proof. Do not skip verification or imply an unavailable companion was invoked.

## Resumable plan handoff

- When the `showdar-plan` stage is selected, prefer the repository's canonical plan location for complex or cross-session work; bounded work may keep a short plan in chat.
- Supply `showdar-build` with the approved spec reference, persisted plan path and revision (or explicit in-chat brief), stable task IDs, dependencies and required verification.
- A saved task checkbox is neither an approval nor a workflow stage completion receipt; the receiving Build agent must revalidate current repo and evidence.
- On session changes or interruptions use `showdar-recover` to reconcile plan tasks with actual source and tests before continuing.
- Do not add new workflow-state schema fields or treat plan persistence as a substitute for serialized workflow checkpoints.


## Evidence handoff

- Load `references/task-handoff.md` when crossing stages or recovering a task. Carry task/requirement IDs, spec/plan revisions, source revision and actual executor, Consumes/Produces contracts, changed paths, exact proof/results, gaps and next owner/action.
- Build owns task-ledger completion; Test adds independent coverage and Review returns separate Spec Compliance and Code Quality verdicts. Missing/stale required proof or a FAIL/BLOCKED required gate prevents completion.
- Preserve existing checkpoint schema and stage choices. Companion availability changes how the contract is followed, not authority or evidence requirements; never claim an unavailable skill/agent ran.

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
- Track portable workflow state (`src/workflow-state.js`): candidate stages, selected stages, active stage, completed evidence receipts, skipped stages with structured reason plus evidence plus policy, next stage or complete, status, revision.
- Checkpoint by serializing state to plain JSON; caller or harness owns persistence. No filesystem or backend store is implied.
- Interrupt explicitly to preserve completed plus skipped plus evidence state without inventing completion.
- Resume by validating the checkpoint, re-resolving current context through Phase 6G, checking workflow compatibility, then continuing or blocking with replan-required.
- Stored state never authorizes continuation; skip requires policy plus evidence, never severity or wording alone.
- Stage completion comes from primitive evidence and stop conditions; workflow completion requires every selected stage completed or validly skipped, no blockers, and required verification satisfied.

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
