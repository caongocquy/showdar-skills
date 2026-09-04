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
