# Task decomposition

A task is independently reviewable and testable. Sequence tasks by dependency, not by file type. Fold setup into the first task that needs it. Put tests alongside behavior, not in a final generic testing task.

Every task should identify exact files or symbols when repository evidence is available, expected behavior, error and edge behavior, ownership, rollback checkpoint, verification command, and completion evidence. A task is not complete because files exist; its proof must observe the required behavior.
