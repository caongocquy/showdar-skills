# Dependency resolution

Record current version, requested target, direct/peer/platform constraints, lockfile owner, package manager, and duplicated/transitive versions that affect runtime. Inspect why a resolver selected each critical version and whether overrides hide an incompatible peer. Preserve lockfile integrity and review churn. Do not assume latest is compatible with the current framework, toolchain, native target, or deployment runtime.
