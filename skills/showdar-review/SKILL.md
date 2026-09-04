---
name: showdar-review
description: Use when reviewing code or diffs for general correctness, architecture, performance, maintainability, or tests.
---

# Showdar Review

## Purpose

- Find defects and material engineering risks in a change without inventing style complaints.
- Prioritize reachable correctness/security failures over cosmetic preferences.
- Review the changed behavior in repository context, not isolated diff syntax.
- Produce actionable findings with location, evidence, impact, and recommended correction.
- Use `data/review-patterns.csv` as a risk prompt, not as an automatic lint rule.

## When to use

- Reviewing a pull request, branch, staged/uncommitted diff, or proposed patch.
- Pre-merge quality pass after implementation/tests.
- Focused security/performance/architecture review of changed paths.
- Evaluating whether tests prove the behavior introduced by a change.

## When not to use

- The user asks to implement the change rather than review it.
- There is no concrete code/change/design to inspect.
- Do not turn code review into a repository-wide refactoring wishlist.
- Formatter/linter-owned style issues are out of scope unless they hide correctness.

## Inputs and assumptions

- Base/reference revision or the current change set.
- Repository instructions and relevant surrounding source/tests.
- Use `scripts/collect-diff.mjs` to collect a read-only diff summary when appropriate.
- A finding is valid only when a concrete scenario shows the risk is reachable.
- Existing repository conventions matter; do not impose a different architecture by preference.

## Non-negotiable rules

- Do not invent findings.
- Every finding includes exact location, evidence, impact, and recommended change.
- Severity reflects user/system impact and likelihood, not reviewer taste.
- Review changed behavior plus the minimum surrounding context needed to validate assumptions.
- Security/auth checks must be verified server/owner-side; client checks are not sufficient policy proof.
- Do not spend review budget on formatting already automated.
- If no material findings exist, say so and mention residual verification limits.

## Workflow

### Phase 1 — understand intent and diff
- Identify intended behavior and changed files/symbols.
- Read tests and nearby ownership boundaries before judging implementation.
- Note generated/vendor changes separately.

### Phase 2 — correctness pass
- Apply `references/correctness.md` to inputs, state transitions, ordering, lifecycle, errors, serialization, nullability, concurrency, and edge cases.
- Trace at least one happy path and one important failure path.

### Phase 3 — security and data pass
- Apply `references/security.md` where auth, input, secrets, storage, networking, files, URLs, or sensitive data are touched.
- Check authorization at authoritative boundaries.

### Phase 4 — architecture and maintainability pass
- Apply `references/architecture.md` and `references/maintainability.md`.
- Check policy ownership, dependency direction, public contracts, type safety, and complexity introduced.

### Phase 5 — performance pass
- Apply `references/performance.md` to realistic hot paths/scales.
- Look for N+1, event-loop/thread blocking, render/rebuild churn, image/bundle/memory cost.

### Phase 6 — tests pass
- Apply `references/testing.md`.
- Ask whether tests can fail for the real changed behavior and critical regression. Use `data/review-patterns.csv` as a searchable prompt across correctness, architecture, security, performance, concurrency, data integrity, API design, state, mobile lifecycle, accessibility, testing, observability, and maintainability.

### Phase 7 — severity and dedupe
- Merge findings with the same root cause.
- Assign P0/P1/P2/P3 only after impact is clear.
- Drop speculative issues that lack a reachable scenario.

## Decision points

- P0: exploitable/critical data loss/outage or universally blocking defect with immediate action required.
- P1: high-impact correctness/security/performance issue likely in realistic use.
- P2: material edge-case/maintainability/test gap that can produce defects but is not immediately severe.
- P3: worthwhile improvement with low defect risk; use sparingly.
- Existing pattern imperfect but safe? Do not demand redesign unless the change worsens it or violates requirement.
- Potential issue depends on impossible caller/state? Drop the finding.

## Stack detection

- TypeScript: `stacks/typescript.md` for unsafe casts/external data/impossible state.
- React Native: `stacks/react-native.md` for lifecycle/list/native/accessibility/release surfaces.
- Flutter: `stacks/flutter.md` for rebuild/async/layout/disposal/platform concerns.
- Node backend: `stacks/node-backend.md` for auth/idempotency/transaction/event-loop/resource concerns.
- Unsupported stack: inspect framework lifecycle and repository conventions before applying generic concerns.

## Failure modes

- Commenting on naming/formatting while missing auth or state defects.
- Severity inflation: every finding labeled blocking.
- “Could maybe” findings with no concrete input/state path.
- Reviewing diff only and missing surrounding contract/owner.
- Requesting abstraction because reviewer prefers a pattern.
- Missing generated/native/deployment impact of a small source change.
- Treating test count as evidence of test quality.

## Stop conditions

- Stop when the requested outcome is outside this skill and hand off to the more appropriate workflow.
- Stop before destructive, irreversible, production, credential, publishing, or deployment actions unless the user explicitly approved them.
- Stop when required evidence is unavailable and proceeding would require guessing about behavior, ownership, or safety.
- Stop when a repository instruction conflicts with this playbook; repository/user instructions win.
- Stop when all changed behavior has received correctness plus relevant security/architecture/performance/test passes and findings are deduplicated/evidence-backed.

## Escalation conditions

- Escalate suspected critical security/data-loss issues with clear evidence and avoid exploit amplification beyond what is needed to explain remediation.
- Ask for missing base/diff/context when it prevents judging behavior.
- If change is too large to review reliably, split by subsystem/commit and state the review boundary.
- If generated code dominates, identify source generator/inputs before reviewing generated diffs line-by-line.

## Verification

- Re-read every finding and identify the exact execution/input path that triggers it.
- Confirm referenced line/symbol exists in the current change/context.
- Check whether existing tests or guards already invalidate the finding.
- Verify severity matches impact/likelihood.
- Remove duplicate/style-only/speculative findings.
- If claiming clean review, state what was and was not executed/tested.

## Output contract

- Findings ordered P0 -> P3.
- Each finding: **severity/title**, **location**, **evidence**, **impact/scenario**, **recommended change**.
- After findings: brief **verification gaps/residual risk** if relevant.
- If no findings: say no material findings found and state unverified areas.
- Keep praise/summary secondary; findings are the primary review artifact.

## Anti-patterns

- Nitpicking formatter-owned style.
- Inventing a bug from an unfamiliar API without checking its contract.
- Reviewing architecture as if repository were greenfield.
- P0/P1 severity without realistic impact.
- Recommending “add tests” without naming missing invariant.
- Large code rewrite suggestion when a local correctness fix is sufficient.

## Example

**P1 — authorization missing on export endpoint**
- Location: route handler.
- Evidence: authentication exists but workspace membership check used by sibling endpoints is absent.
- Impact: authenticated user with another workspace ID can request export.
- Recommendation: enforce server-side membership policy and add cross-workspace integration test.
- See `examples/finding.md`.
