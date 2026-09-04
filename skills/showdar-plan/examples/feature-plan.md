# Example plan shape

Request: add invitation RSVP editing for authenticated hosts.

Current evidence: the host route reads invitation data, the API accepts a full
payload, and the database already has an `rsvpDeadline`; guests use the same
read model, so its response shape is a compatibility boundary.

Scope: add a host-only partial update and optimistic UI feedback. Non-goals are
guest account changes, schema redesign, and replacing the existing form library.

Chosen approach:
1. Validate the patch at the API boundary and authorize invitation ownership.
2. Reuse the existing repository update method and invalidate the host query.
3. Keep the guest read model unchanged and reject edits after the deadline.

Proof per task: authorization integration test, validation test, deadline test,
cache invalidation test, then typecheck/build. Rollback is a server-side flag
that hides editing while preserving reads.
