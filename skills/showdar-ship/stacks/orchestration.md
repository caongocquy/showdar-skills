# Container orchestration delivery verification

Use this only when the task explicitly concerns orchestration execution or
review of an existing orchestration configuration. In ordinary Ship mode,
inspect the files read-only; do not create manifests, modify deployment config,
change traffic, or operate a cluster.

For explicit scope, verify image digest, resource limits, readiness/liveness
behavior, secret references, rollout strategy, replica availability, and
rollback target. A rollout is not healthy until new replicas serve the critical
smoke path and old replicas drain as intended. Keep migration compatibility and
previous image/config available before changing traffic.
