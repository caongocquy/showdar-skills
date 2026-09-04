# Requirements extraction

Translate prose into observable outcomes, constraints, invariants, and non-goals. Separate user-visible behavior from implementation preference. Resolve contradictions before planning. When a requirement is inferred rather than stated, label it and explain the evidence.

A good requirement can be verified. “Improve performance” is not sufficient; define the measured path, current baseline if known, and acceptable result or regression guard. Normalize each item into `actor + trigger + input + observable result + failure/recovery behavior`, and record explicit unknowns instead of filling them with product assumptions.
