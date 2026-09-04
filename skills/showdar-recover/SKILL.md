---
name: showdar-recover
description: Use when interrupted or partial engineering work must be reconstructed from repository evidence before continuing.
---

# Showdar Recover

## Purpose

- Recover context after session interruption, compaction, agent failure, crash, or handoff.
- Distinguish completed-and-proven work from partial, broken, unrelated, and merely claimed work.
- Prevent duplicate edits or accidental overwrite of user/uncommitted state.
- Resume from the smallest verified checkpoint.
- Read `references/interrupted-session.md` and `references/partial-implementation.md` before editing anything.

## When to use

- Agent/task stopped mid-run.
- New session needs to continue previous repository work.
- Context was compacted and exact progress is uncertain.
- Merge/rebase/conflict or failed automation left ambiguous partial state.
- User asks “where were we?”, “continue from current state”, or “recover this task”.

## When not to use

- Clean new task with no prior partial work.
- Normal code review or architecture understanding.
- Do not infer original goal from unrelated git history when user/task context is available.
- Do not auto-resolve conflicts before understanding both sides.

## Inputs and assumptions

- Repository/worktree state and any task/spec/plan/chat summary available.
- Git history/status/diff are evidence but may contain unrelated user changes.
- Previous agent narration is a hint, not proof.
- `scripts/inspect-state.mjs` performs read-only git-state collection.
- Fresh tests/builds are needed before classifying a change as proven complete.

## Non-negotiable rules

- Do not edit files until current state and ownership of dirty changes are understood.
- Never discard, reset, checkout over, or clean uncommitted work without explicit user approval.
- Classify previous claims by filesystem/test evidence, not trust.
- Preserve unrelated user changes.
- Identify last known-good checkpoint and first unverified/broken step.
- Re-run relevant verification before declaring recovered work complete.
- Conflict resolution must preserve semantic intent from both sides, not just remove markers.

## Workflow

### Phase 1 — reconstruct goal
- Read task/spec/plan/commit messages and current conversation context.
- State the original goal and known constraints in one short block.
- Mark inferred goal details explicitly.

### Phase 2 — inspect durable state
- Run `node scripts/inspect-state.mjs <repo>` or equivalent git status/diff/log commands.
- Identify staged, unstaged, untracked, conflict, generated, and unrelated files.
- Read partial implementation and tests before editing.

### Phase 3 — classify progress
- **completed-and-proven**: behavior exists and fresh/reliable proof is available.
- **implemented-unverified**: code appears complete but proof is absent/stale.
- **partial**: interfaces/paths incomplete.
- **broken**: known failing build/test/runtime behavior.
- **unrelated**: pre-existing/user changes outside recovered task.

### Phase 4 — identify checkpoint and dependency edges
- Find the smallest coherent completed slice.
- Identify interfaces later partial work relies on.
- Read `references/failed-runs.md` when previous automation claimed success/failure inconsistently.

### Phase 5 — choose next safest action
- Prefer verifying an existing partial/completed slice before writing new code.
- Resume the first unmet dependency in the original plan.
- For conflicts, read `references/merge-conflicts.md` and resolve semantics before feature work.

### Phase 6 — re-enter normal workflow
- If root cause unknown -> showdar-debug.
- If plan is stale because scope changed -> showdar-plan.
- If implementation is clear -> showdar-build.
- If only verification remains -> showdar-test/review as appropriate.

## Decision points

- Dirty file belongs to user/unrelated task? Preserve it and exclude from recovered change surface.
- Partial interface consumed elsewhere? Verify/finish producer before consumer edits.
- Previous test output says pass but code changed since? Treat as stale and rerun.
- Conflict markers present? Resolve merge semantics before continuing task.
- No git repository? Use filesystem timestamps/task artifacts cautiously and state lower confidence.
- Original goal ambiguous? Ask user rather than reconstructing from broad history.
- Conflict markers? Stop feature work; read both sides and base, resolve semantics, then re-run targeted proof.
- Migration or generated/native state? Freeze destructive actions, identify source-of-truth owner, and verify status before retrying.
- Only stale narration remains? Treat the task as unverified and use the smallest read-only inspection script plus fresh test.

## Stack detection

- Recovery is stack-agnostic, but detected stack determines which build/test/runtime evidence can prove completion.
- Mobile changes may require both shared and native project state inspection.
- Backend changes may include migration/generated schema/job state not obvious from source diff.
- Web changes may include generated build artifacts that should not be mistaken for source completion.
- Use repository-native verification commands once task classification is known.

## Failure modes

- Trusting previous agent “done” message without current proof.
- Running git reset/clean/checkout and destroying user work.
- Starting new implementation while an earlier dependency is broken.
- Treating every dirty file as part of recovered task.
- Resolving conflict mechanically by choosing ours/theirs.
- Declaring complete because expected files exist.
- Replanning everything instead of resuming smallest verified checkpoint.

## Stop conditions

- Stop when the requested outcome is outside this skill and hand off to the more appropriate workflow.
- Stop before destructive, irreversible, production, credential, publishing, or deployment actions unless the user explicitly approved them.
- Stop when required evidence is unavailable and proceeding would require guessing about behavior, ownership, or safety.
- Stop when a repository instruction conflicts with this playbook; repository/user instructions win.
- Stop recovery when goal, current classified state, known failures, and next safest action are clear; then transition to the appropriate execution skill.

## Escalation conditions

- Ask the user when dirty state cannot be confidently assigned to the recovered task.
- Ask before destructive git operations or dropping generated/user files.
- Escalate missing external state such as deployment/migration/store actions rather than assuming they happened.
- If original task context is unavailable and multiple goals fit the diff, request the missing goal.

## Verification

- Re-run status/diff after any recovery edits to confirm unrelated files stayed untouched.
- Freshly run the tests/builds that prove completed slices.
- Compare current task state against original plan/spec requirements.
- Verify conflict markers are gone only after semantic resolution.
- Confirm next action is dependency-safe and does not redo proven work.
- State any prior claims that could not be verified.

## Output contract

- **Original goal** — stated vs inferred.
- **Completed and proven**.
- **Implemented but unverified**.
- **Partial**.
- **Broken / known failures**.
- **Unrelated protected changes**.
- **Remaining work**.
- **Next safest action** with reason and verification needed.

## Anti-patterns

- “Looks mostly done, continue coding.”
- Trusting task checkboxes without code/test evidence.
- Cleaning the worktree to simplify analysis.
- Starting from newest changed file instead of dependency order.
- Resolving conflicts before reading both sides and tests.
- Hiding uncertainty about which changes belong to the task.

## Example

Goal: add cache invalidation after sync.
- Status shows cache helper committed, sync path modified but integration test failing, unrelated README dirty.
- Classify helper as completed if fresh unit test passes; sync integration as broken/partial; README protected/unrelated.
- Next action: reproduce integration failure and trace sync invalidation call before editing.
- See `examples/recovery-report.md`.
