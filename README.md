# Showdar Skills

**Opinionated, practical engineering playbooks for coding agents.**

Showdar Skills is one package containing 15 first-class skills for software-team workflows. They cover engineering, analysis, QA/QC, security, operations, delivery verification, and safe local Git work. Each skill is more than a prompt: it can include references, searchable structured knowledge, stack-specific guidance, deterministic read-only helper scripts, and examples.

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
| `showdar-git` | Complete local Git workflows while preserving unrelated work |
| `showdar-requirements` | Turn product/business input into explicit, testable requirements and acceptance criteria |
| `showdar-quality` | Plan QA/QC verification, risk-based coverage, regression scope, and test scenarios |
| `showdar-security` | Security analysis, threat modeling, auth/authz, data, secrets, and attack-surface risk review |
| `showdar-ops` | Operational engineering for CI/CD, containers, deployment, observability, and rollback with explicit mutation boundaries |

The suite is grouped by capability: Engineering, Analysis, Quality, Security,
and Operations. `showdar-ship` verifies delivery readiness; `showdar-ops`
performs operational work only when explicitly requested. Requirements are not
an implementation plan; quality planning is not automated test implementation.

## Install from source

Showdar Skills is not currently published to the npm registry. This repository
is the source package; install the current checkout as the `showdar` CLI:

```bash
npm install -g .
```

This installs only the CLI globally from the current checkout. It does not
globally enable skills. For a one-off local invocation, use
`node /path/to/showdar-skills/bin/showdar.js ...` instead.

The CLI and the skills have separate scopes:

- The installed CLI reads the package assets from this checkout.
- `showdar init` copies skills into the selected target scope.
- Project scope is the default and writes into the current target project.
- Global scope writes into the current user's verified native skill directories.

Then enter the target project and install the native skills there:

```bash
cd /path/to/project
showdar init --ai codex --profile full
showdar status
showdar doctor
```

`showdar init` defaults to `--scope project --ai universal --profile full`.
The scope controls **which installation boundary** is written, the AI target
controls **which native agent destination** is used, and the profile controls
**which skills** are installed.

```bash
showdar init --scope project --ai codex      --profile full
showdar init --scope project --ai opencode   --profile full
showdar init --scope project --ai claude     --profile backend
showdar init --scope project --ai universal  --profile minimal
showdar init --scope project --ai all        --profile full
```

Native destinations:

```text
codex     -> .agents/skills/
opencode  -> .opencode/skills/ + .opencode/commands/showdar/
claude    -> .claude/skills/
universal -> .agents/skills/
all       -> the three unique project skill destinations above
```

Codex and universal intentionally share `.agents/skills/`; `--ai all`
deduplicates that physical destination.

The target project receives native skill files and, for OpenCode, native
project commands. Project installation also updates the managed routing block
in `AGENTS.md`. Showdar stores project ownership metadata in the target
project's `.showdar.json`; there is no `.showdar/skills` runtime directory.

### Global installation

Global scope does not require a Git repository and does not write a project's
`.showdar.json` or `AGENTS.md`:

```bash
showdar init --scope global --ai codex --profile full
showdar status --scope global
showdar doctor --scope global
```

Verified native global destinations are:

```text
codex     -> ~/.agents/skills/
opencode  -> ~/.config/opencode/skills/ + ~/.config/opencode/commands/showdar/
claude    -> ~/.claude/skills/
universal -> ~/.agents/skills/
all       -> the three unique global skill destinations above
```

Global ownership is stored separately at `~/.showdar/global.json`. It records
only Showdar-managed paths, so `status`, `doctor`, refresh, and `remove` can
operate without touching unrelated user skills. Use `--ai all` only when all
four native targets are wanted.

When the same skill exists in both scopes, Showdar keeps both ownership
records but does not override native agent precedence. OpenCode gives the
project `.opencode/skills` source higher precedence than its global source;
Claude Code documents personal `~/.claude/skills` as higher precedence than
project `.claude/skills`. Avoid installing the same skill in both scopes when
the target agent's precedence is not the one you need.

To refresh skills after changing this source checkout, reinstall the CLI and
run `showdar init` again with the same scope, target, and profile. Initialization
is idempotent and refreshes Showdar-owned files. There is no separate
`showdar update` command.

```bash
# From the source checkout
npm install -g .

# In a project
showdar init --scope project --ai codex --profile full

# From any directory for the user installation
showdar init --scope global --ai codex --profile full
```

Remove only Showdar-owned files with `showdar remove` in project scope or
`showdar remove --scope global` for the user installation.

## Use it

Natural intent routing is the default for installed native skills. Project
initialization adds a small managed routing block to `AGENTS.md`; global
initialization does not modify project files. Each skill has a specific native
name/description for agent discovery.

Codex discovers the installed native skills. Ask naturally, or invoke a
specific skill with its native name:

```text
$showdar-debug login crashes after token refresh
$showdar-plan split this migration into safe steps
$showdar-review review the current changes for auth risks
$showdar-ship verify this change is ready for handoff
$showdar-git commit only the current task changes
$showdar-git merge this branch into develop but do not push
$showdar-requirements review this ticket for missing business rules
$showdar-quality create regression scenarios for this release
$showdar-security threat model this auth flow
$showdar-ops inspect the current deployment setup
$showdar-ops deploy this service to staging
```

`showdar-git` handles local Git workflow only. It does not imply GitHub,
GitHub Actions, CI/CD, deployment, publishing, or release automation; remote
mutations require explicit intent.

OpenCode can use native skill discovery and, when initialized with `--ai
opencode` or `--ai all`, gets project commands under
`.opencode/commands/showdar/`:

```text
/showdar/debug login crashes after token refresh
/showdar/design polish the settings screen
/showdar/review current changes
/showdar/ship ios
/showdar/git commit only the current task changes
/showdar/security threat model this auth flow
/showdar/ops inspect the current deployment setup
```

These `/showdar/...` commands are OpenCode commands, not Codex commands.

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

| Profile | Installed skills |
| --- | --- |
| `minimal` | 8 core engineering skills: understand, plan, build, debug, test, review, recover, git |
| `developer` | 12 general engineering skills plus security |
| `backend` | 14 backend engineering plus requirements, quality, security, and ops skills |
| `qa` | 9 skills focused on requirements, QA, testing, debugging, review, ship, recovery, and Git |
| `product` | 6 skills focused on repository context, requirements, planning, design, quality, and review |
| `full` | All 15 skills |

Profiles select skill bundles, not different stack asset sets. New usage should
choose `minimal`, `developer`, `backend`, `qa`, `product`, or `full`. The
deprecated `web` and `mobile` aliases remain accepted for compatibility and
resolve to `developer`; new manifests store the canonical `developer` profile.

## CLI

```bash
showdar init [--scope <project|global>] --ai <target> --profile <profile>
showdar status [--scope <project|global>]
showdar doctor [--scope <project|global>]
showdar validate
showdar list
showdar remove [--scope <project|global>]
```

`showdar doctor` checks the selected installation against hashes in
`.showdar.json` (project) or `~/.showdar/global.json` (global) and reports
drift. `showdar remove` removes only Showdar-owned skill/command paths; project
scope also removes its managed `AGENTS.md` block. Unrelated agent skills and
user rules are preserved.

`showdar validate` validates the installed Showdar package itself. It rejects
shallow skills, missing required workflow sections, placeholder content, broken
local references/imports, malformed structured data, and invalid
catalog/profile/router/command relationships; it does not validate the target
application. `showdar list` prints the available profiles and skills.

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
npm run validate
npm run eval
npm run check
npm run smoke
npm pack --dry-run
```

The project intentionally stays dependency-light and uses Node.js built-ins for the CLI, validator, search engine, installer, and tests.

## Safety boundary

Showdar skills may inspect release/deployment guidance, but normal Ship usage is delivery verification: it does not create CI/CD or deployment infrastructure, require a deployed endpoint, or grant approval to deploy. Production deploys, publishing/store submissions, destructive migrations, credential operations, and other irreversible actions require explicit user intent and authorization. Skills must never print or commit secret values.

## License

MIT
