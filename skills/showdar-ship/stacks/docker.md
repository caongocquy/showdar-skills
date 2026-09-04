# Docker shipping

## Build an immutable artifact

Pin the base image by an approved tag/digest and record the resulting image digest. Use a multi-stage build so compilers, package-manager caches, tests, and source-only files do not enter the runtime image. Keep the build context minimal, run as a non-root UID/GID where compatible, define an explicit exec-form entrypoint, and make the target architecture (`linux/amd64`, `linux/arm64`, or both) deliberate.

## Runtime contract

Inject secrets at runtime and verify only variable names/references, never values. Check ports, DNS/service names, writable paths, persistent volumes, time zone/CA requirements, resource limits, and PID 1 signal handling. A health check should test the service's readiness contract without depending on a permanently unavailable external system; startup ordering is not readiness. Preserve data volumes and migration order separately from image rollout.

## Release verification

Scan/build the intended image, inspect labels and entrypoint, then run it by digest in an isolated network with production-like non-secret configuration. Verify health transitions, critical smoke flow, graceful stop/restart, dependency outage, volume ownership, and architecture-specific startup. Keep the previous digest/config for rollback and read `references/rollback.md` and `references/post-deploy.md`.

## Wrong turns and edge cases

Do not deploy a mutable `latest` tag, bake `.env` or credentials into a layer, use `localhost` for another service, or run as root to bypass a permissions defect. Watch for native addon/libc mismatch, line endings, shell-form signal loss, bind-mount masking of image files, and a container that is “healthy” while its worker/queue path is dead.
