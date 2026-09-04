# Explicit deployment verification

Only load this reference when the task explicitly requests deployment or
release-execution verification. It is not part of ordinary delivery readiness
and does not authorize a deploy.

For that explicit scope, verify the deployed version or artifact digest,
health/readiness, critical user/API flows, logs/error rate, dependency
reachability, queue/migration state, and platform-specific distribution status.
Define a risk-appropriate observation window and abort threshold. Separate
successful upload/deploy from successful behavior, and record which external
signals remain manual or unavailable.
