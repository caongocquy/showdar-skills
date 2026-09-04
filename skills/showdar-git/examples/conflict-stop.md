# Stop on an ambiguous conflict

After a merge or rebase conflict, report the operation and exact conflict set.
Read both sides, the merge base, task requirements, and relevant tests. If the
desired semantics or ownership cannot be established, stop before choosing
ours/theirs, aborting, or continuing. Ask for the missing decision and preserve
the in-progress state.
