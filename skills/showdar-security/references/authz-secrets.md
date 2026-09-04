# Authentication, authorization, and secrets

Inspect the authoritative owner of each decision. For APIs, follow identity and tenant/object IDs through middleware, service policy, query filters, serializers, and audit logs. Test the reasoning for anonymous, wrong-role, cross-tenant, expired, revoked, duplicate, and replayed requests.

For sessions and tokens, check issuance, audience, expiry, refresh, rotation, revocation, storage, cookie flags, deep-link handoff, logout, and error handling. For secrets, report only the variable or file name and location; never copy values into output. Check CI logs, bundles, source control, crash reports, telemetry, and examples as exposure surfaces.

Recommend the smallest owner-side fix and a regression check. Secret rotation, key ownership, privacy retention, and compliance decisions remain explicit open decisions when not supplied.
