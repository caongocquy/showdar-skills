# Backend repository signals

Find the process entrypoint, HTTP/RPC registration, dependency wiring, configuration loader, persistence adapters, migrations, jobs/queues, health endpoints, observability hooks, and shutdown path. Separate request lifecycle from background workers and one-off migration tooling.

Trace one request as `input -> validation/auth -> handler -> service policy -> persistence or queue -> serializer -> response`. Trace one background job as `enqueue -> durable payload -> worker claim -> side effect -> retry/dead-letter -> completion`. Record transaction and idempotency owners, connection-pool lifecycle, readiness versus liveness, and graceful shutdown behavior. A health endpoint that does not exercise required dependencies is a weak signal.
