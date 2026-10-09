# Executing and resuming Markdown plans

## Locate and reconcile
- Discover the current canonical plan through repo instructions, task description and specs; `docs/plans/<feature>.md` is a fallback, not a search constraint.
- Verify the linked product spec's approval if brainstorming was triggered, plan revision, current Git branch/status, and affected dependencies.
- Check each `TASK-NNN` checkbox against actual implemented behavior, diff and reliable test receipts. A checked task can be stale. A task left unchecked may already be implemented, so inspect before redoing.
- Classify: `not-started`, `implemented-unverified`, `verified-complete`, `blocked`, or `superseded`. The checkbox represents `verified-complete` only.

## Per-task loop
1. Choose the earliest unmet task whose declared dependencies are verified. Do not infer a dependency is satisfied from its checkbox alone.
2. Inspect current implementation and run a minimal confirming test to avoid duplication.
3. Apply the smallest scoped change using the repository's Git preflight and policy checks.
4. Run the task's proof checks and relevant broader checks. Record *actual* commands/results and source revision when available.
5. For verified-complete, check `[x]` and add a concise receipt to the plan ledger *only when the plan file can safely be edited*. If unavailable, leave the artifact untouched and report progress in chat.
6. For failed or missing proof, leave `[ ]`, classify blocker/unverified state and report the next safe action. Do not mark an unverified task complete.

## Replan and resume
- Mismatched product decision, interface contract or incompatible plan revision: stop affected implementation and reopen that decision with Plan/Brainstorm; do not silently broaden change scope.
- Keep unchanged task IDs across revisions; explicitly mark superseded tasks and stale receipts without erasing their history.
- Plan Markdown is not executable orchestration, not user approval, not a workflow-state checkpoint and not a Git permission record.
- On interruption report exact task IDs, state, relevant test evidence, plan path/revision, remaining blockers and the earliest verified dependency-ready task.
