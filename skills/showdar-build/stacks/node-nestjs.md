# Node, Fastify, and NestJS build guidance

Validate request input at the framework boundary, keep authorization in the service/owner boundary, and make response/error contracts explicit. Do not block the event loop with large synchronous work. Keep related persistence writes transactional, make retries idempotent, and close pools, servers, and workers from one lifecycle owner. Test the real HTTP and persistence boundary when those semantics change.
