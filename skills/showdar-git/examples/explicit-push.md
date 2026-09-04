# Explicit push

When the user explicitly requests a push, first verify the current branch,
upstream, commit SHA, working tree, and relevant checks. Push the named branch
to the intended remote, then verify upstream state. A normal push is distinct
from force-push; never substitute the latter after a rebase without explicit
authorization.
