# Deployment operations

A deployment plan names the artifact, target environment, owner/approval, prerequisites, sequence, health gates, observability, failure handling, rollback trigger, and downtime or consistency limits. A plan is not execution.

Execution requires explicit action and target intent, such as “deploy this service to staging”. Before a remote mutation, verify target, artifact, authorization, preflight, and rollback. Stop on mismatch, missing approval, destructive scope, or failed health evidence. Record remote results separately from local checks.
