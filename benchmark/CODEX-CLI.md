# Codex CLI live benchmark adapter

This is maintainer-only benchmark infrastructure. It is not included by the
package `files` allow-list and is not part of Showdar runtime routing.

## Detected CLI

The installed CLI was probed read-only on 2026-09-08:

- Version: `codex-cli 0.153.4`
- Non-interactive command: `codex exec`
- Structured output: `codex exec --json` emits JSONL events on stdout
- Model: `-m/--model <MODEL>`
- Reasoning: no dedicated `exec` flag; `-c model_reasoning_effort="<level>"` is the supported config override. The key is present in the installed config and is passed explicitly by the adapter.
- Working directory: `-C/--cd <DIR>`
- Sandbox: `-s/--sandbox`, with `read-only`, `workspace-write`, and `danger-full-access` values
- Approval: `--approve-for-me` is supported by `exec` and implies the workspace-write automatic-review mode. It cannot be combined with `-s`.
- Config isolation: `--ignore-user-config` skips `CODEX_HOME/config.toml`; `--ignore-rules` skips user/project execpolicy rules
- Session isolation: `--ephemeral` avoids persisting the run; the adapter never calls `resume` or `fork`
- Exit status: the child process exit code is captured directly
- Observable command events: JSONL `item.completed` events with `item.type=command_execution` expose command strings when Codex emits them
- Observable usage: `turn.completed.usage` can expose input/output/reasoning token counts; otherwise `tokens` remains `null`

The adapter uses these common settings for every comparison variant:

```text
model       = gpt-5.6-luna
reasoning   = medium
approval    = approve-for-me
sandbox     = workspace-write (implied by --approve-for-me)
timeout     = 120000 ms
cwd         = the variant's fresh fixture copy
```

## Isolation strategy

The adapter prepares one fixture snapshot per scenario, fingerprints it, and
copies that snapshot for every variant. A previous variant is never reused as
the next variant's working tree. The Codex process receives:

```text
HOME=<fresh fixture path>
USERPROFILE=<fresh fixture path>
CODEX_HOME=<existing user CODEX_HOME, for auth only>
--ignore-user-config
--ignore-rules
--ephemeral
```

Authentication remains in the existing Codex-managed `CODEX_HOME`; no auth,
token, cookie, or config file is copied into a fixture. The child environment
is an allow-list, so API-key environment variables are not forwarded.

The probe used a temporary `/private/tmp` cwd and isolated `HOME` and returned
`SHOWDAR_CONTEXT=absent`. The machine has no `~/.agents/skills/showdar-*`
directories, no Codex plugin path containing Showdar skills, and no global
Codex instruction file containing Showdar routing. The real checkout's
`AGENTS.md` is not in the fixture's parent path. An OpenCode task directory
named `showdar-skills` exists but is not a Codex skill root and is not used.

## Variant semantics

- `baseline`: the identical neutral fixture wrapper plus the raw user task; no Showdar guidance.
- `legacy-showdar`: the raw user task plus one flagship skill selected by lexical matching against the actual v0.2.3 `SKILL.md` descriptions from commit `2b5c187`. It does not use Phase 1-4 modules or benchmark expected labels.
- `showdar-0.3`: current `normalizeIntent`, `buildRoutePlan`, `buildVerificationPlan`, and `resolveDecision` produce a compact orchestration brief. It uses the scenario's benchmark-normalized intent, so raw-prompt intent parsing is explicitly not evaluated.

The adapter passes only the raw task and applicable guidance. It never passes
`expectedBehavior`, `assertions`, expected files, expected answers, or scorer
data to Codex.

## Metrics

The adapter keeps bounded redacted stdout/stderr and compact structured event
metadata. `toolCalls` and `tokens` are `null` when Codex does not expose them;
they are never estimated. Fixture fingerprints, changed files, external test
results, process duration, exit status, and normalized hard-failure violations
are captured outside the evaluated agent.
