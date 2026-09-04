# Node debugging

## Apply when

Use this guide for Node services, workers, CLIs, and scripts with hangs, latency, crashes, rejected promises, memory growth, or environment-specific behavior. Record Node version, module mode, package manager lockfile, process role, deployment/container image, and the exact command.

## Architecture and evidence

Separate synchronous event-loop work, libuv thread-pool work, worker threads, child processes, and downstream services. Capture request/operation IDs, event-loop delay, CPU/heap samples, active handles, open sockets, connection-pool usage, stream queue sizes, exit code/signal, and the first causal error. For async failures inspect promise ownership and whether the process has an `unhandledRejection`/`uncaughtException` boundary; do not confuse a logged error with a handled operation.

## Investigation

Compare a single request, concurrent load, slow dependency, aborted client, and graceful shutdown. Use a CPU profile/event-loop delay measurement for blocking code, heap snapshots and retained paths for leaks, and stream backpressure metrics for producer/consumer imbalance. Inspect database/network timeout, retry, pool saturation, DNS, TLS, and transaction boundaries. Verify environment/config names and parsed types without printing secret values. Read `references/async-races.md`, `references/networking.md`, or `references/memory.md` for the shared evidence model.

## Wrong turns and edge cases

Do not add retries or increase timeouts before identifying whether the failure is overload, a dead dependency, or duplicate side effects. Avoid synchronous filesystem/crypto/JSON work on request paths when input size is unbounded. Watch for stream listeners that never detach, pools created per request, aborted requests continuing work, ESM/CJS loader differences, and process crashes before request middleware runs.

## Verification

Run the focused test and the production-equivalent start command with the same Node/config shape. Exercise timeout, cancellation, overload, dependency failure, and shutdown paths; verify exit behavior, metrics/log correlation, resource cleanup, and no unhandled rejection warnings.
