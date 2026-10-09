# Executable task decomposition

## WHEN
Use for material multi-boundary work, dependency planning or a migration. A small, already specified single-session change can use this contract briefly in chat.

## DO
Choose a vertical slice: one user-visible outcome through the required boundaries, including its test. Fold necessary setup into the first usable slice. Avoid automatic model → service → UI → tests tasks when none can prove a usable result alone.

| Situation | Task shape | Proof boundary |
| --- | --- | --- |
| Feature can deliver a narrow usable path | First tracer bullet, then additional behaviors | One acceptance path across affected boundaries |
| Tasks share a mutable contract or file | Producer before consumer; serialize conflicting writes | Producer output matches consumer assumptions |
| Wide schema/API refactor cannot stay green in isolated slices | expand → migrate → contract with a compatibility window | Old/new clients coexist, migration is complete before removal |
| No executable harness | Label manual proof or blocked verification | Exact observed check and disclosed limits |

For every nontrivial task record:

| Field | Required content |
| --- | --- |
| ID / requirement | Stable TASK-NNN and acceptance or decision IDs |
| Outcome / non-goals | Observable result and excluded adjacent work |
| Depends on | Producer task IDs; explicit `none` for a root task |
| Consumes / Produces | Interface shape, version and invariants at shared boundaries |
| Change surface | Evidence-backed files/symbols, or bounded uncertainty |
| Test seam | Public behavior boundary; expected assertion RED → minimal GREEN → scoped REFACTOR, or reasoned exemption |
| Negative cases | Invalid input, failure, authority and compatibility cases relevant to this slice |
| Proof | Existing exact command or labeled manual steps, expected result and actual observed receipt |
| Rollback | Compatibility checkpoint and reversible path; disclose irreversible actions |

Compute the dependency-ready frontier from unmet tasks whose prerequisites have verified proof. A checkbox alone is insufficient. Reject unknown dependency IDs, cycles and mismatched Consumes/Produces. If TASK-001 consumes TASK-002 and TASK-002 consumes TASK-001, split out the shared contract or revise the graph before execution. Two ready tasks that write the same file are not parallel-ready.

## PROVE
Map every requirement to a task and proof; confirm named commands exist, shared contracts match and the graph is acyclic. Each slice must have a checkable completion condition. Report expected vs observed proof separately; planning has no executed test receipts.

## FAIL
Missing producer, cycle, conflicting contract or unresolved approved decision leaves the affected task blocked. Return to the owning requirement/decision, revise only affected tasks and retain history. A migration cannot remove an old field while an unmigrated consumer still relies on it.

## HANDOFF
Send plan path/revision or in-chat brief, approved spec revision, task IDs, dependency-ready frontier, contracts, proof instructions, risks and next owner. Keep Git/write authority separate from plan readiness. See `../examples/feature-plan.md` for a vertical slice example.
