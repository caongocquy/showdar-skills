# Dart build guidance

Keep domain state distinct from widget state, make nullability meaningful, and model `Future` cancellation or stale-result behavior explicitly. Use immutable value objects at boundaries, keep expensive work out of build methods, and dispose streams/controllers at their owner. Run analyzer and tests with the pinned SDK before touching generated files.
