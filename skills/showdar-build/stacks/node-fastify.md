# Node/Fastify build guidance

Keep request validation and error contracts explicit at the Fastify boundary. Do not block the event loop with heavy synchronous work. Make plugin, pool, server, worker, and shutdown ownership clear. Keep related persistence side effects transactionally coherent, retries idempotent, and readiness distinct from liveness.
