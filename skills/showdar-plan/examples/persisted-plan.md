# Example: Invitation RSVP editing implementation plan

> Illustrative schema only. Replace examples with evidence from the actual repository; never invent a test command, approval or commit SHA.

- Plan revision: 1
- Status: ready
- Canonical spec: existing approved invitation spec (identify its path/revision in the real project)
- Goal: authenticated hosts can edit RSVP configuration
- Non-goals: guest authentication redesign and database replacement
- Existing evidence: to be populated from repository inspection
- Approach: validate and authorize patch at service boundary; preserve guest read contract
- Risk/rollback: host-only feature flag; avoid breaking guest payload

## Ordered tasks

- [ ] **TASK-001** — Validate and authorize host updates.
  - Depends on: none
  - Acceptance: authorized patch succeeds; wrong owner, invalid payload and expired deadline fail
  - Files/symbols: name verified API and service symbols during planning
  - TDD: expected RED is denied-owner update test; GREEN is minimal authorization/validation; REFACTOR reruns unchanged behavior proof.
  - Proof: existing project integration test command (discover exact command before execution)
- [ ] **TASK-002** — Refresh host UI after successful mutation.
  - Depends on: TASK-001
  - Acceptance: host shows saved values; failed save preserves previous values and explains failure
  - Proof: repository-native component test and manual negative path where needed

## Verification ledger

| Task ID | State | Command / scenario | Result | Source ref | Evidence gap |
| --- | --- | --- | --- | --- | --- |
| TASK-001 | pending | not run | not verified | unknown | awaiting implementation |
| TASK-002 | pending | not run | not verified | unknown | depends on TASK-001 |

## Open decisions and next step

- Blocker: none assumed by the example; verify against the real spec
- Next: TASK-001 after confirming execution authorization and Git preflight
