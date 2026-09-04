# Architecture signals

Architecture is inferred from repeated dependency direction, state ownership, public interfaces, and runtime entrypoints—not from folder names alone.

## Signal strength

- Strong: workspace/package manifests; route registration; process bootstrap; dependency injection bindings; public exports; repository/service protocols; database migrations; queue registration; native bridges; test providers.
- Medium: repeated import direction; feature module boundaries; state store ownership; serializer/DTO seams; build targets; separate worker commands.
- Weak: names such as `core`, `shared`, `utils`, `domain`, or `clean`. Verify these against imports and call paths.

## How to read a signal

1. Record the exact file and symbol that emits the signal.
2. Find at least one caller and one owned side effect.
3. Check whether another path bypasses the apparent owner.
4. Mark the conclusion as observed, inferred, or uncertain.

## Common conflicts

- A `repositories/` folder is weak evidence if UI code constructs queries directly.
- A public barrel is a supported API only when package exports and consumers agree.
- A state store is the owner only if writes and invalidation route through it.
- A generated file is evidence of tooling, not necessarily the source of truth.

When boundaries conflict, report both intended and observed dependency direction. Do not silently normalize a tangled codebase into textbook architecture.
