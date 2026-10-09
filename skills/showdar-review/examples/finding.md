# Example finding

Severity: P1 — authorization missing on export endpoint.

Location: `routes/export.ts`, before the export job is queued.

Evidence: the handler checks authentication but never verifies workspace
membership. Sibling read endpoints call `requireWorkspaceMember`, while this
route accepts a caller-provided workspace ID and starts a long-running job.

Impact: any authenticated user who guesses a workspace ID can request its data.
The issue is exploitable without a client bug and should block release.

Recommended fix: enforce the shared membership policy before queueing work,
return the existing forbidden response, and add an integration test for a user
from another workspace. Re-check that logs and job payloads do not expose data.

## Independent verdict examples (illustrative, not executed)

- Spec Compliance: FAIL; Code Quality: PASS — TASK-004 requires CSV export but only JSON export exists. The scoped JSON code is sound; missing CSV behavior still fails AC-EXPORT-01.
- Spec Compliance: PASS; Code Quality: FAIL — TASK-004 delivers the documented export fields, but the server trusts a caller's workspace ID. The P1 finding above requires a cross-workspace negative test and owner-side authorization.
- Spec Compliance: BLOCKED; Code Quality: PASS — no authoritative export requirements were supplied; inspected authentication and serialization are sound within the available code context. No requirement coverage or unexecuted test success is implied.

An actual report supplies reviewed base/head, spec/plan revisions, exact locations and executed proof. These examples are not review receipts.
