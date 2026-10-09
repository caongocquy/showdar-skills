# Example: rate-table exclusive upper bound (illustrative only)

Task: TASK-002 — fee lookup uses a `[min, max)` bracket where `max` is exclusive.

RED:
- Write an assertion that a key equal to `max` must not match a bracket.
- Run the repository's **existing** targeted test command against current production code.
- Observe the intended assertion failure. A command failing because the test tool is missing is not valid RED.

GREEN:
- Make the smallest code change to implement `key >= min && key < max`.
- Run the same focused test command and confirm it passes.

REFACTOR:
- Improve duplication/naming within the pricing change only, if needed.
- Rerun the focused tests, relevant full suite and typecheck as appropriate.

Handoff:
- Record the exact executed commands and results under TASK-002's verification ledger.
- Never check a task complete from this example alone; this document is explanatory, not test output.
