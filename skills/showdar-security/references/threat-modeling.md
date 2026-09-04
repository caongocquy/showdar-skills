# Threat modeling

Start with assets, actors, entry points, trust boundaries, and the decision the review must support. Trace the most important attacker-controlled input to its first authoritative control and final sensitive sink.

Use a compact table when useful:

| Asset | Actor/entry point | Trust boundary | Threat | Existing control | Gap/evidence |
| --- | --- | --- | --- | --- | --- |

Consider spoofing, tampering, repudiation, information disclosure, denial of service, and privilege escalation only where they explain a reachable risk. Record prerequisites such as account role, network position, platform, feature flag, or user action.

Separate confirmed issues from suspected risks and unknowns. A missing control is not automatically exploitable; state what evidence would confirm it. Keep secret values and sensitive payloads redacted.
