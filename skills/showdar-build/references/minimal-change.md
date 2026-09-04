# Minimal coherent change

Minimal does not mean fewest lines. It means the smallest change that completely preserves required invariants, error handling, tests, and ownership boundaries. Start by tracing every caller of the owning function, then write the narrowest behavior proof. Keep a change local unless a shared contract or true volatility boundary requires movement. Avoid unrelated cleanup, but do not omit a necessary boundary or regression test to keep the diff small.
