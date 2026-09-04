# Migration strategy

Prefer one controlled version step when changes are coupled and testable; use staged upgrades when intermediate compatibility is required or blast radius is large. Define ordering across runtime, framework, native, source, codegen, and lockfile changes. Regenerate only owned artifacts, inspect template diffs, and verify each checkpoint before the next. Stop at the last proven checkpoint when a later layer fails.
