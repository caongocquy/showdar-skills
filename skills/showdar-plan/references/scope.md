# Scope control

The plan should name the smallest coherent change surface. Include only adjacent refactors required to make the requested behavior safe or testable. Put attractive but unnecessary cleanup in non-goals.

Build a change-surface table with `required`, `possibly affected`, `must not change`, and `verification owner`. Trace callers before editing shared functions, and include generated, native, or config files only when the actual flow proves they participate. For every proposed file or subsystem, answer: what requirement forces this change? If no requirement does, remove it. If it is only future reuse, remove it.
