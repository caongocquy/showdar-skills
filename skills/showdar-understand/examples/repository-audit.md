# Example: repository audit output

Request: explain where dashboard data comes from and where a stale metric could
be introduced.

Detected stack: Next.js + TypeScript + PostgreSQL; package manager is pnpm; CI
runs the web test and build jobs. Entrypoints are `app/` routes and
`src/jobs/worker.ts`. Persistence lives under `src/db/`, with migrations in
`drizzle/`; client state is limited to local interaction.

Critical flow traced: sign-in -> session lookup -> dashboard query -> server
render -> metric cards. The query cache is a boundary because it can outlive a
request; the sync worker is the writer that must invalidate it.

Uncertainty: queue ownership is split across two packages. Recommended next
read: package exports plus every queue producer/consumer call site. Output must
separate observed facts from inferred ownership.
