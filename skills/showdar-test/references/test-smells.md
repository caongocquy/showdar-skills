# Test smells

Warning signs: mocks that assert mocks, sleeps for timing, snapshot-only behavior proof, huge shared fixtures, tests coupled to private methods, duplicate E2E coverage, environment-dependent order, leaked resources, blanket retries, and tests that can pass while the user-visible bug remains. Replace sleeps with state/barrier/event synchronization; replace mock choreography with observable behavior; retain snapshots only as reviewed structural evidence paired with semantic assertions.
