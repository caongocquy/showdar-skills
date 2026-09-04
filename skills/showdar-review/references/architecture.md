# Architecture review

Check ownership and dependency direction, public contract changes, duplicated policy, cross-layer leakage, lifecycle, generated/native ownership, and whether a new abstraction earns its cost. Trace one producer-to-consumer path and one failure path. Do not demand a preferred pattern when the existing design is coherent and safe; report only a reachable defect or material risk introduced by the change.
