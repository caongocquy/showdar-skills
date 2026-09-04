---
name: showdar-build
description: Implement a requested change as the smallest coherent patch that fits existing architecture, contracts, error handling, and stack conventions.
---

# Showdar Build

## Purpose

- Convert an approved requirement/plan into maintainable production code.
- Preserve existing ownership boundaries and public contracts unless change is explicitly required.
- Minimize blast radius without cutting required correctness, error handling, or tests.
- Make implementation decisions evidence-based and stack-native.
- Read `references/minimal-change.md` and `references/architecture-boundaries.md` before introducing new abstractions.

## When to use

- Implementing a feature, refactor, bug fix after root cause is known, or architecture-safe change.
- Applying an approved UI implementation after design decisions are clear.
- Small migrations where the upgrade-specific analysis is already complete.
- Completing a bounded task recovered from a previous session.

## When not to use

- Root cause is unknown; use showdar-debug.
- Requirements/change surface are unclear and multiple approaches remain; use showdar-plan.
- The work is only review or testing strategy.
- Production deploy/release actions belong to showdar-ship.

## Inputs and assumptions

- User outcome and current repository conventions are understood.
- Relevant tests/build/typecheck commands are known or discoverable.
- Existing public interfaces and state ownership are constraints unless explicitly changed.
- For dirty repositories, distinguish user work from this task before editing.
- `scripts/change-surface.mjs` can summarize current git changes without mutation.

## Non-negotiable rules

- Change the smallest coherent surface that fully satisfies the behavior.
- Never “fix” uncertainty with broad optional chaining, swallowed exceptions, retries, or cache clearing.
- Preserve or improve type safety at external/data boundaries.
- Handle expected error/recovery behavior explicitly using `references/error-handling.md`.
- Do not introduce a generic abstraction for one use unless it creates a real ownership/volatility boundary.
- Keep comments focused on why/non-obvious constraints, not restating code.
- Add/adjust tests at the lowest level that can fail for the intended regression/behavior.
- Do not rewrite unrelated formatting or files.

## Workflow

### Phase 1 — pre-change check
- Read repository instructions and current relevant implementation/tests.
- Confirm exact change surface and must-not-change contracts.
- Inspect current diff/status so unrelated user changes are protected.

### Phase 2 — define behavior proof
- Identify the test or executable scenario that proves the requested behavior.
- For a defect, reproduce the regression first where practical.
- For new behavior, encode the smallest useful failing/acceptance test before implementation when the project supports it.

### Phase 3 — implement minimal coherent change
- Follow existing naming, dependency injection, state ownership, and error contracts.
- Keep new code local until a true reusable boundary exists.
- Update public types/contracts deliberately when required.
- Use `references/feature-flags.md` only when rollout/reversibility justifies a flag.

### Phase 4 — stack-specific pass
- Read the matching file under `stacks/` for lifecycle, rendering, native, server/client, or event-loop hazards.
- Check generated/native files only if the change requires them.

### Phase 5 — verification
- Run targeted test first, then relevant suite/typecheck/lint/build.
- Inspect final diff for unrelated changes, duplicated policy, unsafe fallback, and missing edge behavior.
- Verify all claims from fresh command output.

## Decision points

- One function change vs new service? Prefer local unless ownership/reuse demands a boundary.
- Error can be recovered here? Handle with context; otherwise propagate without swallowing cause.
- Behavior can race/retry? Model idempotency/concurrency explicitly rather than adding debounce blindly.
- Existing design/system pattern safe? Follow it; otherwise document the targeted deviation.
- Rollout risk high? Consider flag/staged path with explicit removal condition.

## Stack detection

- React: read `stacks/react.md` for state/effect/render/accessibility traps.
- Next.js: read `stacks/nextjs.md` for server/client/cache/runtime boundaries.
- React Native: read `stacks/react-native.md` for lifecycle/list/native-performance concerns.
- Flutter: read `stacks/flutter.md` for rebuild/async/layout/state concerns.
- Node/Fastify: read `stacks/node-fastify.md` for validation/event-loop/resource lifecycle.
- TypeScript: read `stacks/typescript.md` for unknown-boundary validation, unions, and public contract typing.
- NestJS: use `stacks/node-nestjs.md` for module/provider/request ownership and transaction/error boundaries.
- Dart, Swift, Kotlin, and Rust/Tauri: read the matching stack file for lifecycle, concurrency, native, and release constraints.
- Unsupported stacks: inspect project conventions and apply the same minimal/coherent contract.

## Failure modes

- Shotgun edits across layers because ownership was not identified.
- “Defensive” null/error handling that hides the real contract violation.
- Test passes only because a dependency is mocked away.
- New abstraction increases indirection without reducing policy duplication or volatility.
- Implementation changes public behavior without updated types/tests/docs.
- Performance-sensitive loop/render path gets more allocations or I/O without measurement.
- Native/build files changed by guesswork.

## Stop conditions

- Stop when the requested outcome is outside this skill and hand off to the more appropriate workflow.
- Stop before destructive, irreversible, production, credential, publishing, or deployment actions unless the user explicitly approved them.
- Stop when required evidence is unavailable and proceeding would require guessing about behavior, ownership, or safety.
- Stop when a repository instruction conflicts with this playbook; repository/user instructions win.
- Stop when requested behavior is implemented, the relevant tests/builds pass freshly, and final diff contains no unexplained changes.

## Escalation conditions

- Ask when implementation exposes an unresolved product choice or compatibility break not covered by the plan.
- Escalate destructive migration, secret, publishing, or production action.
- Return to debugging if the assumed root cause fails under the regression test.
- Return to planning if the required change surface expands into independent subsystems.

## Verification

- Run the narrow behavior/regression test and read the result.
- Run typecheck/analyzer/compiler as applicable.
- Run relevant integration/build/platform checks for touched boundaries.
- Inspect `git diff` or equivalent for unrelated edits and accidental generated files.
- For performance-sensitive changes, compare measured path before/after when feasible.
- Ensure no secrets/logged sensitive data were introduced.

## Output contract

- **Implemented** — concise behavior and exact change surface.
- **Why this shape** — ownership/contract rationale when non-obvious.
- **Tests/verification** — commands actually run and outcomes.
- **Risks/unverified** — anything not proven locally.
- **Follow-up** — only required follow-up; omit speculative cleanup.

## Anti-patterns

- Opportunistic repository-wide refactor during a feature fix.
- Adding `try/catch` that returns null/default for unknown failures.
- Threading booleans through layers instead of modeling real state.
- Memoizing every React/Flutter subtree without measurement.
- Duplicating existing token/config/business policy instead of using the owner.
- Declaring done after code edits without fresh verification.

## Example

User request: “Prevent duplicate submit on payment confirmation.”
- Confirm whether duplicate effect is UI re-entry, network retry, or backend idempotency before patching.
- Add the lowest-level regression that reproduces the confirmed duplicate path.
- Implement minimal guard/idempotency at the true owner, not every caller.
- Verify normal retry/recovery still works.
- See `examples/change-surface.md` for how to bound the patch.
