# Swift build guidance

Prefer value semantics and explicit actor or queue ownership for shared mutable state. Treat async cancellation and view/task lifetime as part of the contract. Validate decoded external data, keep UI state separate from domain state, and preserve accessibility labels and Dynamic Type. Build the affected scheme when deployment target, capability, package, or native API changes.
