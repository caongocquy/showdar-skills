# Docker debugging

## Apply when

Use this guide for failures that differ between a host and a container, including build, startup, networking, persistence, permissions, health checks, or architecture. Record image digest, base image/runtime, host and target architecture, command/entrypoint, container exit code, and compose/orchestrator context.

## Architecture and evidence

Separate Dockerfile/build-context errors from image/runtime errors. Inspect the effective command, working directory, user, environment variable names (never values), mounts, exposed versus published ports, DNS/resolver configuration, service aliases, health status, and filesystem ownership. Compare `linux/amd64`/`linux/arm64` and libc/runtime assumptions; an image that builds can still fail at startup on the target architecture. Capture the first causal log before the health-check cascade.

## Investigation

Run the exact image digest with a minimal command, then add the entrypoint, dependencies, mounts, and health check one boundary at a time. Verify the process binds to the container interface, not only `localhost`; test service DNS and dependency readiness separately from application health. For volume issues inspect mount path, UID/GID, read-only flags, and existing data without deleting it. Read `references/build-failures.md` for image/build evidence.

## Wrong turns and edge cases

Do not rebuild with a moving tag, delete volumes, or run as root just to make the symptom disappear. Check build secrets versus runtime secrets, PID 1 signal handling, shell-form entrypoints, line endings, CA certificates, timezone/locale, file permissions, port collisions, and health checks that probe an unavailable dependency.

## Verification

Use a pinned image/digest, `docker inspect`, container logs, health output, and an in-network smoke request. Reproduce with the target architecture/runtime and a clean volume when persistence is relevant; confirm graceful stop, restart, dependency outage, and readiness behavior.
