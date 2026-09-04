# Flutter build guidance

Keep rebuild scope proportional to state changes and preserve one clear source of truth. Use lazy list/layout primitives, guard `mounted` and context across async gaps, dispose owned resources, and model platform-channel failures. Verify text scaling and release-like targets when layout or native behavior changes.
