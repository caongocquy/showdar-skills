# Correctness review

Trace changed behavior through inputs, state transitions, failure paths, concurrency, lifecycle, and outputs. Check invalid assumptions, missing branches, stale state, ordering, boundary values, nullability, serialization mismatch, retry/idempotency, and resource leaks. A finding needs a concrete reachable input/state path, evidence in the current code, impact, and a correction that preserves the intended contract.
