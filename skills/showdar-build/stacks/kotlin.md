# Kotlin build guidance

Keep coroutine scope tied to lifecycle or service ownership, model cancellation and failure explicitly, and avoid blocking the main thread. Validate serialized input, keep state single-owned, and use stable identity in lists. Treat Gradle, manifest, resources, permissions, and release variants as part of the change surface when Android behavior changes.
