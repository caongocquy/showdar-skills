# Threat model with unresolved assumptions

**Assets:** account data and session tokens.

**Actors:** anonymous visitor, authenticated user, support operator, and service account as supplied or observed.

**Trust boundaries:** browser/mobile client to API, API to data store, and CI to release artifact.

**Threats and controls:** consider cross-account access, token replay, sensitive logs, malformed input, and artifact tampering; list only controls observed in code or configuration.

**Open questions:** who owns tenant authorization, which deep-link hosts are trusted, how long sessions remain valid, and who can rotate credentials. Do not convert these decisions into invented requirements.
