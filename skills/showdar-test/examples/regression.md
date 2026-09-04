# Example regression choice

Bug: rapid retry creates two payment records.

Observed contract: one logical checkout has one idempotency key, and the server
must return the original result for repeated requests even when requests overlap.

Lowest reliable proof: an integration test sends two concurrent requests with the
same key, asserts one persisted payment, and asserts both responses identify the
same result. Include the database uniqueness constraint in the test environment.

Avoid making tap timing the only proof; an E2E test is appropriate only if the
client retry/navigation behavior is also part of the defect. Add the E2E smoke
after the deterministic server regression is green.
