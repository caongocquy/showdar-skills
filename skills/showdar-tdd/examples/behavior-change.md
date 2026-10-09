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

## Concrete seam and negative case (illustrative only)

Approved fixture: `[0, 100)` costs 5; `[100, 200)` costs 8. Exercise the exported lookup, not a private bracket predicate:

```js
assert.equal(lookupFee(99), 5);
assert.equal(lookupFee(100), 8);
assert.throws(() => lookupFee(-1), /outside supported range/);
```

These literal expected values follow the accepted bracket table. Rejected: `const expected = lookupFee(100); assert.equal(lookupFee(100), expected)` repeats the implementation and cannot detect its boundary bug. Also rejected: mocking lookupFee to return 8; it erases the changed contract. Use the actual repository import/command and record output; this sample has not been executed against a pricing implementation.
