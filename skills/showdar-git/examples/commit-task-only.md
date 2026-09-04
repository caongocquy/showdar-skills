# Commit only task-owned files

Given a mixed tree:

```text
M README.md
M src/foo.js
M AGENTS.md
?? .agents/
```

Classify `README.md` and `src/foo.js` as `FEATURE/TASK`. Keep `AGENTS.md` and
`.agents/` under `EXCLUDED`. Run `git add README.md src/foo.js`, inspect
`git diff --cached --check` and `git diff --cached`, then commit only that
staged set. Do not reset, clean, or stage the whole tree.
