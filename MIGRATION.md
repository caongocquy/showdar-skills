# Migrating to 0.3.0

## Skill install roots

`--ai universal` still installs to `.agents/skills` (project) and
`~/.agents/skills` (global). Explicit harness targets now use their native
roots:

- OpenCode: `.opencode/skills` / `~/.config/opencode/skills`
- Cursor: `.cursor/skills` / `~/.cursor/skills`
- Claude Code: `.claude/skills` / `~/.claude/skills`
- Codex: `.agents/skills` / `~/.agents/skills`

One invocation installs to one resolved root only; no compatibility copies
are made automatically.

## Existing projects

Existing `.showdar.json` v2 configs remain valid. No config-version migration
is required. Re-running `showdar init` with an explicit `--ai` target moves
managed skills to the newly requested native root; the previous root is not
silently deleted unless existing Showdar stale-cleanup semantics apply.

## Profiles

Profile names and composition are unchanged:

- `minimal` (8), `developer` (12), `backend` (14), `qa` (9), `product` (6),
  `full` (15).
- `mobile` and `web` remain accepted as deprecated aliases for `developer`;
  manifests store the canonical name.

## Single-skill additions

Use `showdar add <skill>` instead of re-running a larger profile to add one
skill:

```bash
showdar add debug
showdar add security --ai cursor
showdar add review --scope global --ai claude
```

Additions preserve the configured profile and are idempotent.

## Routing behavior

0.3.0 uses stricter deny-by-default authority semantics. Conditional,
hypothetical, contextual, and negated actions stay non-authoritative until
current request semantics permit them, and risk metadata no longer overrides
an explicit governing action. Do not assume byte-identical routing with older
releases where behavior intentionally tightened.
