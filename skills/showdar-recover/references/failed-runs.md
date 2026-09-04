# Failed agent runs

Treat previous agent narration, task checkboxes, and stale logs as hints, not proof. Verify filesystem, status/diff, current tests, build artifacts, and command exit codes directly. Capture the last fresh successful invariant, first failing command, changed ownership, and uncommitted partial patch before selecting the next action. If a command timed out, re-check its process/authoritative state before restarting.
