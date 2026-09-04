# Next.js build guidance

Keep client boundaries narrow, make cache and freshness semantics intentional, and model loading/error states at route or data boundaries that can recover. Keep secrets and server-only modules out of the browser bundle. Verify server/client output, hydration, metadata, image cost, and production runtime behavior when those surfaces change.
