# Regression tests

First reproduce the reported symptom with a focused test or executable scenario. Verify it fails for the original defect rather than a fixture error, passes with the causal fix, and ideally fails again when the fix is disabled or reverted. Encode the user/system invariant, including negative and ordering cases, not the implementation accident. Keep one higher-level smoke only when an additional boundary is part of the defect.
