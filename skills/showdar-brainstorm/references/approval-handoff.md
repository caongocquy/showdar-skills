# Adaptive paths, approved Decision Brief and handoff

## WHEN

Read source evidence, canonical spec/ticket, accepted decisions and known answers first. Skip refinement when behavior, acceptance and material choices are already specified/approved. A proven local fix also skips; do not create alternatives or a written spec for ceremony.

## DO

| Path | Trigger | Action/artifact | Approval boundary |
| --- | --- | --- | --- |
| Spike | Feasibility remains unknown, e.g. can the existing device API stream this format? | Define one question, bounded time/tool budget and observable success; label artifacts throwaway | Agree the experiment scope before writes; production follow-up needs separately approved production scope |
| Bounded | Existing behavior seam with a material rule choice, e.g. vouchers may or may not stack | Concise complete brief in chat; include negative case, compatibility and exact decision | Explicit acceptance of the whole brief/revision before planning/implementation |
| Architectural | New subsystem/public contract/persistence, e.g. offline synchronization changes conflict ownership | Written Decision Brief with alternatives, ownership, migration/rollback and proof strategy | Revision-specific full-brief approval before planning/implementation; file writes need their own authority |

Choose by unresolved decisions, not prompt length/file count. If hidden complexity reveals new data ownership or compatibility constraints, raise rigor for those affected decisions; preserve accepted answers. Approval of a spike does not approve deployment or copying its prototype into production.

A complete brief includes Goal, Context evidence, Scope, Non-goals, stable DEC identifiers, Alternatives/trade-offs, Assumptions, Acceptance notes, Open questions, Approval revision and Next skill. For a spike, include its hypothesis, budget, success/failure signal and artifact disposition. Known source facts, assumptions and proposals remain distinct.

## PROVE

Record path and why, source pointers, acceptance/negative cases, exact approved revision and direct user approval evidence. States remain skipped, needs-input, ready-for-approval, approved; never silently promote. Partial answers or approval of one choice do not approve the whole brief. Do not claim an experiment succeeded without actual command/output or observation.

## FAIL

Unresolved behavior keeps needs-input. A complete proposal awaits full acceptance as ready-for-approval. Contradictory source evidence reopens only affected decisions with revision-specific approval. Example: “stack vouchers” answers one rule; it does not approve an unreviewed expiry design. A successful throwaway spike still needs an approved production follow-up before Build. Missing device/tool capability is a recorded blocker, not evidence of feasibility.

## HANDOFF

Pass path, status, brief/spec revision, decision IDs, acceptance and non-goals, source/context pointers, actual experiment evidence or gaps, persistence location and next owner to Requirements/Plan. Adaptive persistence: update existing canonical spec/ticket only with authorization; use docs/showdar/specs/<feature>.md for complex durable handoff when writing is approved. Small approved briefs may stay in chat; cross-session consumers need recoverable approval evidence. Plan persistence is separate.

Workflow checkpoints and approved designs never grant mutation, commit, remote or deployment permissions. Repository Git policy and guard still apply before every task-owned write.
