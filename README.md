# Showdar Skills

**Opinionated, practical engineering playbooks for coding agents.**

Showdar Skills is one package containing ten deep flagship skills for understanding, planning, designing, building, debugging, testing, reviewing, upgrading, shipping, and recovering software work. Each skill is more than a prompt: it can include references, searchable structured knowledge, stack-specific guidance, deterministic read-only helper scripts, and examples.

## Flagship skills

| Skill | Purpose |
| --- | --- |
| `showdar-understand` | Map an unfamiliar repository from executable evidence |
| `showdar-plan` | Turn requirements into bounded, executable plans |
| `showdar-design` | Design/implement/review/polish UI with searchable design intelligence |
| `showdar-build` | Implement the smallest coherent production change |
| `showdar-debug` | Evidence-first root-cause debugging |
| `showdar-test` | Choose and implement the lowest effective test level |
| `showdar-review` | High-signal P0–P3 code review |
| `showdar-upgrade` | Safe dependency/framework/platform upgrades |
| `showdar-ship` | Delivery verification and release-readiness assessment; explicit release execution is opt-in |
| `showdar-recover` | Recover interrupted or partial work safely |

## Install the CLI

From this repository during development:

```bash
npm install -g .
```

Then initialize a project:

```bash
cd /path/to/project
showdar init --ai codex --profile mobile
```

AI target controls **where** skills are installed; profile controls **which** skills are installed.

```bash
showdar init --ai codex      --profile full
showdar init --ai opencode   --profile web
showdar init --ai claude     --profile backend
showdar init --ai universal  --profile mobile
showdar init --ai all        --profile full
```

Native destinations:

```text
codex     -> .codex/skills/
opencode  -> .opencode/skills/ + .opencode/commands/showdar/
claude    -> .claude/skills/
universal -> .agents/skills/
all       -> all four destinations
```

Showdar stores only ownership/install metadata in `.showdar.json`. There is no `.showdar/skills` runtime directory.

## Use it

Natural intent routing is the default. The installer adds a small managed routing block to `AGENTS.md`, and each skill has a specific native name/description for agent discovery.

Codex can invoke a skill directly:

```text
$showdar-debug
$showdar-design
$showdar-ship
```

OpenCode also gets native project commands:

```text
/showdar/debug login crashes after token refresh
/showdar/design polish the settings screen
/showdar/review current changes
/showdar/ship ios
```

## Design intelligence

`showdar-design` follows a progressive-disclosure model similar to strong knowledge-backed skills: orchestration stays in `SKILL.md`, while structured knowledge and stack rules are queried only when useful.

```text
skills/showdar-design/
├── SKILL.md
├── data/
│   ├── products.csv
│   ├── styles.csv
│   ├── colors.csv
│   ├── typography.csv
│   ├── motion.csv
│   ├── accessibility.csv
│   ├── components.csv
│   ├── ui-patterns.csv
│   └── stacks/
├── references/
├── scripts/
└── examples/
```

Example local search from inside the installed skill:

```bash
node scripts/search.mjs --query "wedding editorial elegant" --domain products
node scripts/search.mjs --query "long list performance" --stack react-native
```

The same pattern is used across the suite where it adds value: debug has failure patterns and context collection, test has a strategy matrix and tool detection, review has severity/risk references, upgrade has compatibility checks, ship has platform release playbooks, and recover has read-only state inspection.

## Profiles

- `minimal` — core engineering loop without design/upgrade/ship
- `web` — all ten skills
- `backend` — all except design
- `mobile` — all ten skills
- `full` — all ten skills

## CLI

```bash
showdar init --ai <target> --profile <profile>
showdar status
showdar doctor
showdar validate
showdar list
showdar remove
```

`showdar doctor` checks the project install against hashes in `.showdar.json` and reports drift. `showdar remove` removes only Showdar-owned skill/command paths and its managed `AGENTS.md` block; unrelated agent skills and user rules are preserved.

`showdar validate` is the repository quality gate. It rejects shallow skills, missing required workflow sections, placeholder content, broken local references/imports, malformed structured data, and invalid catalog/profile/router/command relationships.

## Skill quality contract

Every flagship `SKILL.md` includes:

- purpose and trigger/non-trigger rules
- inputs and assumptions
- non-negotiable constraints
- phased workflow and decision points
- stack detection/adaptation
- failure, stop, and escalation conditions
- verification requirements
- output contract
- anti-patterns
- a concrete example

The detailed knowledge belongs in `references/`, `data/`, `stacks/`, `scripts/`, and `examples/` so agents load only what the current task needs.

## Development

```bash
npm test
node bin/showdar.js validate
npm pack --dry-run
npm run smoke
```

The project intentionally stays dependency-light and uses Node.js built-ins for the CLI, validator, search engine, installer, and tests.

## Safety boundary

Showdar skills may inspect release/deployment guidance, but normal Ship usage is delivery verification: it does not create CI/CD or deployment infrastructure, require a deployed endpoint, or grant approval to deploy. Production deploys, publishing/store submissions, destructive migrations, credential operations, and other irreversible actions require explicit user intent and authorization. Skills must never print or commit secret values.

## License

MIT
