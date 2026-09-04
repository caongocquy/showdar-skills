# End-to-end tests

Reserve E2E for critical user journeys and integration risk that lower levels cannot prove. Keep flows deterministic, seed state deliberately, use role/label semantics, and assert user-visible outcomes plus recovery. Cover one happy path and the highest-risk failure/permission/navigation path. Do not duplicate every unit case through E2E, hide flakes with retries, or use arbitrary sleeps.
