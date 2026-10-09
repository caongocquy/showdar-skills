# Example: host RSVP edits (illustrative, not executed proof)

Approved requirement: authenticated hosts can edit an owned invitation before its deadline; guests keep the existing read response. Current evidence: an API update boundary and existing RSVP form are available. Non-goals: account recovery, schema redesign or replacing the form library.

## TASK-001 — Edit the attendance response end to end
- Requirement: AC-RSVP-01 — owned attendance edits before the deadline.
- Non-goals: dietary notes (TASK-002) and the shared exclusions above.
- Depends on: none.
- Outcome: host changes attendance, sees the saved result, and guest reads remain compatible.
- Consumes: existing authenticated host, invitation ownership and deadline contracts.
- Produces: validated partial-update response reused by the next slice.
- Change surface: existing update handler, owning repository method and attendance form; confirm exact paths before execution.
- Test seam: API authorization/validation plus the form submission outcome.
- Negative cases: wrong owner, expired deadline and invalid attendance value.
- Proof: discover repository commands; first observe the intended assertion RED, implement minimally, then GREEN and post-refactor checks. No commands have been run in this example.
- Rollback: use a server feature flag only if repository evidence confirms one; otherwise prepare an explicit scoped revert that preserves guest reads.

## TASK-002 — Edit dietary notes using the same contract
- Requirement: AC-RSVP-02 — bounded dietary-note editing with the same ownership/deadline rules.
- Non-goals: attendance redesign, schema changes and the shared exclusions above.
- Depends on: TASK-001 with fresh required proof.
- Consumes: TASK-001 partial-update response and error shape.
- Produces: bounded dietary-note editing through API and UI with compatible guest reads.
- Change surface: note-update validation and the existing note form; confirm paths before execution.
- Test seam: the partial-update API and observable note form submission.
- Negative cases: oversized notes, wrong owner and expired deadline.
- Proof: note-update integration and form tests, then affected checks; exact commands come from the repository.
- Rollback: disable or revert only note editing while retaining TASK-001 attendance behavior and the compatible read contract.

Dependency-ready frontier initially contains TASK-001 only. Both tasks include API, UI and tests because each proves a usable behavior. If a later field rename affects 180 callers, use expand → migrate → contract: support both fields, verify migrated consumers, then remove the old field after compatibility proof.

Handoff: approved requirement revision, task IDs/contracts, proof instructions, rollback and next ready task. An unchecked task with no receipt remains unverified.
