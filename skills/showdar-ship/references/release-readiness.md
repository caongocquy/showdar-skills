# Delivery readiness

Delivery readiness is a verification decision, not an execution command. Gather
fresh evidence for relevant tests, typecheck/analyzer, lint, build, package or
export output, artifact metadata, and target-specific prerequisites. Confirm
version, environment names, feature flags, migrations, secret references
without values, and observability assumptions when they are in scope.

Inspect existing CI or release configuration read-only when it helps discover
canonical commands. A deployed endpoint, provider result, store result, or
green CI run is not required for ordinary local readiness. Separate local proof
from external proof and report external checks as unverified unless the task
explicitly requests release/deployment verification.
