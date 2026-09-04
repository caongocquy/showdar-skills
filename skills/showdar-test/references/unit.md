# Unit tests

Use for deterministic policy, parsing, calculations, reducers/state transitions, and small components/functions where dependencies are not the behavior under test. State the invariant first, use table/property cases for meaningful boundaries, and assert observable output/state or error—not internal call choreography. Keep fixtures local and deterministic. Move upward to integration when persistence, protocol, cache, lifecycle, or native semantics are the risk.
