# Integration tests

Use when correctness depends on boundaries working together: HTTP plus validation plus service, persistence adapter plus real database semantics, component plus state provider, cache invalidation, or native bridge wrapper. Prefer realistic or ephemeral dependencies for the contract under risk. Control time and concurrency with barriers, seed isolated data, assert response plus durable side effect, and clean resources at their owner. Do not mock away the boundary being proven.
