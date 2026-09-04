# Architecture choices

Prefer existing repository patterns when they are safe and comprehensible. Introduce a new abstraction only when it creates a real ownership boundary, removes duplicated policy, or isolates volatility. Avoid new layers that only rename calls.

Document public contracts, data flow, state ownership, failure propagation, concurrency, and lifecycle effects. For each boundary state who validates input, who owns side effects, who can retry or cancel, and which test observes the result. Explain why the chosen boundary is safer than nearby alternatives and what is intentionally not changed.
