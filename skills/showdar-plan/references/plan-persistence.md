# Adaptive Plan Persistence

## Choose a location
1. Read repo instructions and discover existing plan/ticket conventions. Existing canonical artifacts take priority.
2. Short, single-session work stays in chat. For staged, cross-session or multi-agent work, propose a Markdown plan at the canonical plan path; use `docs/showdar/plans/<feature>.md` only when the repo has no convention.
3. A request for advice/plan is not blanket permission to write files. Present the proposed path/content and acquire authorization as needed, then run Git preflight. If the write is blocked, leave the proposal in chat.
4. Link the approved spec/ticket and revision. An unapproved brainstorm draft cannot become an execution-ready plan.

## Durable plan contract
- Header includes goal, plan revision, status (`proposed` / `ready` / `in-progress` / `blocked` / `completed`), spec path/reference and spec revision if applicable.
- Include non-goals, concrete current-state evidence, chosen approach/trade-offs, risks/rollbacks and unresolved decisions.
- Every task has stable `TASK-NNN` ID, unchecked `- [ ]`, dependency IDs, covered acceptance/decision IDs, file/symbol scope, observable behavior, edge/error cases and exact existing proof commands or a clearly labeled manual check.
- Add a verification ledger with task ID, actual command/check, outcome, environment/ref when known and gaps. Planned checks are not actual verification.
- Plan a RED → GREEN → REFACTOR loop for testable behavior changes. Link intended failing assertion, test command, minimum production change, and proof after refactoring. For non-applicable work label the exemption and alternate verification, without inventing a failing run.
- Mark the first dependency-ready, not-yet-proven task as the next action; do not simply pick the first unchecked item when its prerequisites are unmet.

## Ownership and completion
- Only implementation plus passing required proof permits checking `[x]`. Absent, failed, skipped, or stale proof leaves `[ ]` and is reported as blocked or implemented-unverified.
- A checked box is not itself proof. Repo code/tests and fresh evidence override stale narration.
- When decisions change, increment plan revision, preserve unchanged task IDs, track superseded work and invalidate affected evidence explicitly; never erase historical results.
- The approved spec governs product behavior; the plan does not grant Git mutation permission, merge authority or deployment privileges.
- Workflow-state checkpoint JSON remains an independent execution record with no plan-path additions.

## Handoff
Report plan path/revision (or chat-only), what was proven, blocked/unverified task IDs, exact proof and next dependency-ready task. Never silently persist if the user only asked for a read-only plan.
