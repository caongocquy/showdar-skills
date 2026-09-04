# Example change surface

Request: add an optional `includeArchived` filter to the project list.

Input evidence:
- The route calls `ProjectService.list` and returns the existing DTO.
- The repository already stores `archivedAt`; no migration is required.
- Two callers use the service: the dashboard and the export job.

Reasoning:
1. Add the filter to the internal query input with a default of `false`.
2. Keep the response shape and pagination cursor unchanged.
3. Check both callers because the export job must intentionally opt in or out.
4. Add a service test for default, true, and false values, plus a route test.

Expected output: changed service/query code, caller proof, and a short list of
files intentionally untouched. Verification must include the focused tests and
the repository typecheck; a database schema change would be out of scope.
