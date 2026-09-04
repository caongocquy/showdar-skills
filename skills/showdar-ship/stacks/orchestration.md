# Container orchestration shipping

Verify image digest, deployment config, resource limits, readiness/liveness behavior, secret references, rollout strategy, replica availability, and rollback target. A rollout is not healthy until new replicas serve the critical smoke path and old replicas drain as intended. Keep migration compatibility and previous image/config available before changing traffic.
