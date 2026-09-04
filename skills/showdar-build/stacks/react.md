# React build guidance

Keep server, URL, draft, and derived state distinct. Use effects only to synchronize external systems; derive render state directly. Use stable domain keys and semantic HTML/native controls. Profile before memoization and test pending, error, focus, and stale-result paths.
