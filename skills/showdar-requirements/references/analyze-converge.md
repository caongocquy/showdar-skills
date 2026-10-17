# Conditional Analyze and Converge

## WHEN

Analyze is a read-only mode within Requirements, not a workflow stage. Use it on explicit consistency requests or meaningful cross-artifact contradictions/coverage gaps. Skip for small, fully defined, sufficiently verified work without such a gap. Converge runs only when a material unresolved decision prevents progress. Use canonical tickets/specs/plans and chat references; no mandatory files or artifact layout.

## Analyze

1. Identify the available approved and candidate source/spec/plan/test revisions, requirement/acceptance/decision/task IDs, approval evidence and proof status. Preserve existing IDs; label local finding IDs as analysis IDs. Missing artifacts or unknown revisions stay `NOT_AVAILABLE`; do not fabricate sources, business rules or approvals.
2. Compare only relevant links using the checks below. A missing future plan before planning is not a coverage defect: check coverage against the current handoff's expected artifacts and scope. An unavailable required artifact leaves an explicit gap; it cannot produce a clean verdict.
3. Report each finding with affected requirement/decision/task IDs (or explicit unavailable fields), exact source/artifact path or chat reference, revision and line/section evidence, severity and impact, recommended next action/owning artifact, known decision owner, and `implementation blocked: yes/no` with reason. For a missing link, cite the inspected artifact section and missing ID/relationship rather than inventing a source line.

| Check | Evidence and next action |
| --- | --- |
| Contradictory requirements and accepted decisions | Compare terminology, roles, permissions, states and acceptance rules at their exact revisions; report both sources and request the authoritative choice instead of inferring intent from code. |
| Missing acceptance criteria | Name the requirement and missing observable outcome or relevant negative boundary; return to Requirements. |
| Requirement coverage | In an existing plan, map each in-scope requirement/criterion to a task or an explicitly justified deferral; flag missing coverage without inventing work. |
| Orphan implementation task | Identify a task without an accepted requirement/decision or justified enabling/infrastructure purpose; ask to justify or remove speculative scope. |
| Dependency conflicts | Check missing producers, unknown dependency IDs, cycles, incompatible Consumes/Produces versions and conflicting parallel edits; return affected tasks to Plan. |
| Missing or inadequate verification plan | Map requirements/tasks to an observable check that exercises the acceptance boundary; a proposed command is `NOT_RUN`, not executed proof. |
| Stale or mismatched artifact revisions | Compare source, approval, spec, plan and test/proof identities. Preserve both conflicting revisions and historical receipts; mark affected proof stale and require reconciliation/reverification. Never select the newest revision as authoritative merely by date. |

Return `ANALYSIS_READY | NEEDS_DECISION | BLOCKED` plus findings and the next owner/action. `ANALYSIS_READY` means no material consistency/readiness gap in the inspected scope; it does not mean implemented, tested, approved or authorized. `NEEDS_DECISION` means a material stakeholder choice remains; `BLOCKED` means required evidence, dependencies or verification plans are missing/incompatible. Both stop affected implementation. If both apply, report `BLOCKED` and list the decisions too. Nonblocking findings may coexist with readiness if their impact and disposition are explicit. Scope the stop to affected tasks and their dependents; unrelated authorized work may continue.

Analysis has no automatic artifact edits, test execution, stage transition, approval or mutation authority. Report planned checks as `NOT_RUN`; retain actual executed receipts distinctly. Persist a report only when authorized and after ordinary Git preflight.

## Converge

1. Separate supplied facts, repository observations, bounded assumptions and unresolved decisions. Deduplicate questions against the approved Brief/spec revision and reuse approved answers without another interview.
2. Rank blockers by downstream impact and dependency blocking: permissions/data integrity and choices invalidating many tasks precede isolated choices; break ties by the earliest blocked dependency. Ask only the single highest-impact necessary question with source evidence, viable alternatives and their consequences. If evidence already settles it, cite that evidence rather than ask.
3. Record an explicit answer as a proposed user decision, retaining existing decision IDs and revisions for unchanged decisions. Give affected decisions/the proposed brief a new revision; retain prior revisions, provenance and approval history. An answer is not whole-brief approval.
4. Recheck affected links and reopen only affected decisions when conflicting evidence appears. Stop implementation while an unresolved decision materially changes behavior, permissions, architecture or data integrity. Never convert unresolved blockers to assumptions at handoff.
5. If refinement/Brainstorm was triggered, show the complete current Decision Brief revision for explicit approval under the existing gate. Partial assent does not approve it. Reuse unchanged accepted decisions in that brief; do not re-interview them. Fully specified work gains no new approval gate.

Return `RESOLVED | NEEDS_INPUT | BLOCKED`, remaining questions, whole-brief approval status when applicable, and next owner/action. Resolved ambiguity alone does not grant approval or mutation authority.

## HANDOFF

Pass canonical source/artifact references and exact revisions (or `NOT_AVAILABLE`), requirement/acceptance/decision IDs, approved versus proposed choices, approval evidence for the current Brief when required, analysis verdict/findings, unresolved blockers, planned versus executed verification and next owner/action. The receiver reconciles these identities with current artifacts before planning or Build; stale approval/proof cannot silently become current. This is text within existing handoffs, not a machine schema or a new stage.
