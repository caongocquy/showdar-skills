# Integration test guidance

Use real request, repository, cache, or bridge boundaries where their contract is the risk. Seed isolated state, control time and concurrency with barriers, and clean resources at the owner. Assert both returned result and durable side effect or rollback. Keep fixtures small enough that the first failing boundary is obvious.
