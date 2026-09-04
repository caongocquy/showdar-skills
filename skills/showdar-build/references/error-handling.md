# Error handling

Handle errors at the layer that can add recovery or context. Preserve original cause and correlation without secrets. Distinguish expected domain failures, cancellation, validation, programmer errors, and infrastructure failures. Map errors once at the boundary that owns the contract; do not catch to return an ambiguous default. User-visible states need a safe explanation, recovery action, and pending/disabled behavior where relevant. Test both success and failure paths.
