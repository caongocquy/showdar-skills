---
name: showdar-plan
description: Use when agreed behavior needs a bounded implementation plan, change surface, task order, risks, or verification steps.
---

# Showdar Plan

## Purpose

- Turn an idea, bug requirement, migration, or design decision into executable engineering work.
- Make scope and non-goals explicit before code changes begin.
- Derive tasks from current repository evidence instead of generic software phases.
- Expose compatibility, data, lifecycle, platform, security, and rollback risks early.
- Read `references/requirements.md`, `references/scope.md`, and `references/task-decomposition.md` when requirements are ambiguous or the plan is expanding.

## When to use

- New feature or behavior spans multiple files or boundaries.
- The user explicitly asks for a plan, breakdown, architecture approach, or implementation order.
- An upgrade/migration needs staged execution.
- A risky fix needs change-surface and rollback thinking before implementation.
- Multiple agents/engineers may execute the work and need unambiguous handoff.

## When not to use

- A tiny local edit is already fully specified and planning would add no decision value.
- The user only wants repository understanding; use showdar-understand.
- Root cause is unknown; debug first instead of planning a guessed fix.
- Do not write a long plan merely to satisfy ceremony for a one-line safe change.

## Inputs and assumptions

- The requirement or intended outcome is available.
- The current repository flow is understood enough to name the real change surface.
- If not, run showdar-understand first or collect focused context with `scripts/collect-planning-context.mjs`.
- Existing repository conventions and public contracts are constraints unless the user asks to change them.
- Plan from current versions/config, not assumed framework behavior.

## Non-negotiable rules

- Every task must correspond to an observable requirement or necessary safety/verification step.
- State non-goals to prevent scope creep.
- Name exact files/symbols when repository evidence supports them; otherwise name the boundary and explain uncertainty.
- Put tests/verification beside the behavior they prove, not in a vague final “add tests” task.
- Include rollback or staged rollout for irreversible/high-blast-radius changes.
- Do not invent requirements to make the architecture cleaner.
- Avoid placeholders such as “handle errors appropriately” without defining the required behavior.

## Workflow

### Phase 1 — normalize the requirement
- Rewrite the goal as observable behavior.
- Separate constraints, invariants, preferences, and non-goals.
- Identify unresolved questions that materially change architecture or scope.

### Phase 2 — anchor to current state
- Summarize current runtime/data/state flow only as far as the requirement needs.
- Identify owning boundaries and public interfaces.
- Record exact current versions/configuration for migrations or platform work.

### Phase 3 — choose an approach
- Generate at least two viable approaches when trade-offs are real.
- Compare complexity, compatibility, reversibility, performance, testability, and maintenance.
- Recommend one and state why it fits this repository rather than a greenfield ideal.

### Phase 4 — define change surface and risk
- List required changes, possible affected areas, and must-not-change contracts.
- Use `references/risk-analysis.md` for data/auth/native/concurrency/deployment-sensitive work.
- Query `data/planning-checklists.csv` through its indexed `category`, `tags`, and `stack` fields before finalizing tasks.
- For every task include producer/consumer order, compatibility window, rollback boundary, negative path, and exact proof command when those risks apply.
- Define rollout/rollback or feature-flag needs.

### Phase 5 — decompose execution
- Order tasks by dependency and independent reviewability.
- Each task states files/symbols, behavior, error/edge behavior, test, and verification command.
- Keep task boundaries small enough that a reviewer could approve one and reject the next.

### Phase 6 — self-review
- Check coverage against every requirement and non-goal.
- Remove generic steps, duplicated tasks, speculative refactors, and unresolved placeholders.

## Decision points

- Unknown root cause? Stop planning the fix and switch to debugging.
- One local coherent change? Use a short plan instead of multi-phase decomposition.
- Public API/schema change? Add compatibility and consumer migration tasks.
- Data migration? Define expand/migrate/contract or another reversible sequence.
- Native mobile change? Separate shared code from iOS/Android build/release work.
- New abstraction? Require a concrete ownership/volatility reason before including it.

## Stack detection

- Detect stack before naming verification commands or platform files.
- Use `stacks/mobile.md` for lifecycle/native/release concerns.
- Use `stacks/web.md` for rendering/cache/responsive/accessibility concerns.
- Use `stacks/backend.md` for contract/persistence/idempotency/rollout concerns.
- Unsupported stacks follow the same planning contract using repository-specific build/test evidence.

## Failure modes

- Generic sequence: “update code, add tests, verify”.
- Planning a guessed solution before root cause or current ownership is known.
- Adding architectural cleanup unrelated to the user outcome.
- Omitting non-happy paths, migration ordering, or compatibility surfaces.
- One huge task that spans independent review boundaries.
- Tests only at the end with no mapping to behavior.

## Stop conditions

- Stop when the requested outcome is outside this skill and hand off to the more appropriate workflow.
- Stop before destructive, irreversible, production, credential, publishing, or deployment actions unless the user explicitly approved them.
- Stop when required evidence is unavailable and proceeding would require guessing about behavior, ownership, or safety.
- Stop when a repository instruction conflicts with this playbook; repository/user instructions win.
- Stop when every requirement maps to an ordered, independently verifiable task and remaining uncertainty is explicitly documented.

## Escalation conditions

- Ask one focused question when an unresolved product/compatibility choice changes the approach.
- Escalate production data, auth/security policy, billing, or destructive migration decisions to the user.
- Split the plan when independent subsystems can deliver/test separately.
- If exact files cannot be named because current state is unclear, return to repository understanding rather than guessing.

## Verification

- Map each stated requirement to at least one task and proof step.
- Confirm every named command/script exists in the repository or label it as an expected new interface.
- Check type/signature names for consistency across tasks.
- Search for vague placeholders and replace them with behavior/commands.
- Confirm non-goals are not reintroduced by task descriptions.
- Confirm rollback/compatibility steps exist for high-risk changes.

## Output contract

- **Goal** — one observable outcome.
- **Non-goals** — excluded adjacent work.
- **Current state** — task-relevant flow and ownership.
- **Chosen approach** — with alternatives/trade-offs.
- **Change surface** — required, possibly affected, must not change.
- **Risks and dependencies** — including compatibility/rollback.
- **Ordered tasks** — exact behavior and files/symbols where known.
- **Verification matrix** — command/scenario proving each task and final result.

## Anti-patterns

- Turning the plan into a restatement of the ticket.
- Treating folder structure as implementation detail without data/control flow.
- “Add validation/error handling/tests” without concrete cases.
- Over-designing abstractions before a second real use exists.
- Hiding unresolved product decisions inside implementation tasks.
- Claiming “low risk” based only on small diff size.

## Example

User request: “Add biometric login to the mobile app.”
- Goal: returning authenticated users can unlock a locally stored session using supported device biometrics.
- Non-goals: account recovery and server auth redesign.
- Plan secure storage/session ownership, enrollment state, iOS/Android capability/permission behavior, fallback, tests, and release checks.
- Split shared session logic from native platform configuration where required.
- See `examples/feature-plan.md` for the expected shape.
