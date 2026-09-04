# Git operation safety

| Operation | Default | Evidence required |
| --- | --- | --- |
| `status`, `diff`, `log`, `branch` | allowed | none; read-only |
| selective `add` | local | path ownership is clear |
| commit | local | cached diff and checks are correct |
| branch switch | local | dirty paths are preserved or explicitly handled |
| merge | local | source, target, and merge intent are clear |
| rebase | guarded | history is unpublished or rewrite is explicitly accepted |
| cherry-pick | guarded | commit identity and dependencies are understood |
| pull | guarded | upstream and resulting history are understood |
| push | explicit | user names the remote/branch or clearly requests push |
| force-push | exceptional | explicit confirmation and published-history impact |
| tag/release/remote deletion | out of scope by default | explicit request and separate safety review |
| GitHub Actions/CI/CD/deploy | out of scope | separate task, never inferred from Git work |

## Mixed ownership checklist

1. Capture `git status --short` before staging.
2. Read task-owned diffs and inspect untracked paths.
3. Write a FEATURE/TASK and EXCLUDED classification.
4. Stage explicit files, including intentional deletions.
5. Compare `git diff --cached` with the classification.
6. Preserve excluded work in the final report.

## Conflict checklist

- identify the operation and conflict paths;
- read both sides and the merge base where needed;
- inspect generated/lockfile conflicts separately;
- resolve semantically, then stage only resolved paths;
- run checks before continuing;
- stop when the intended result is not provable.
