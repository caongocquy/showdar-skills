# API authorization review

**Request:** Review an account endpoint for authorization and data exposure.

**Evidence:** Read the route, handler, policy owner, object lookup, tenant filter, serializer, logs, and tests. Record paths and redacted identifiers only.

**Finding format:** State whether the issue is confirmed or suspected, the affected account asset and API trust boundary, the caller role and prerequisites, impact, severity rationale, bounded remediation, residual risk, and verification.

**Example:** If a request ID reaches a lookup without owner/tenant enforcement, report the reachable IDOR/BOLA path and enforce authorization at the service boundary. Add a cross-account regression test through `showdar-test`; do not infer security from client-side route hiding.
