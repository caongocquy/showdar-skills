# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- Portable workflow skill model: 15 primitives (`kind: primitive`) plus 4
  workflows (`kind: workflow`) for 19 total installable skills. Primitive
  profiles, routing, and taxonomy remain unchanged.
- `showdar-feature`: adaptive end-to-end feature implementation over
  understand, requirements, plan, design, build, test, and review stages.
- `showdar-bugfix`: adaptive defect resolution over understand, debug, build,
  test, and review stages, including investigation-only mode.
- `showdar-release`: release readiness versus execution separation over
  quality, security, ship, and authority-gated ops stages.
- `showdar-incident`: operational incident investigation and recovery over
  understand, debug, recover, verification, and authority-gated ops stages.
- `showdar add feature|bugfix|release|incident` installs workflows through the
  existing installer; short names normalize like primitives.

## [0.3.0]

### Added

- Explicit harness targets for `showdar init` and `showdar add`: `codex`,
  `opencode`, `cursor`, `claude`, `universal`, and `all`.
- `showdar add <skill>` for installing a single primitive skill without
  re-running a whole profile (for example `showdar add debug`,
  `showdar add security --ai cursor`,
  `showdar add review --scope global --ai claude`).
- Native Cursor skill roots (`.cursor/skills` for projects,
  `~/.cursor/skills` for global installs).
- Deny-by-default routing authority coverage for conditional, modal,
  contextual, hypothetical, and negated actions.

### Changed

- Each harness target now installs into its native skill directory instead of
  sharing one compatibility root.
- Routing uses a single authoritative engine: current request → structural
  interpretation → authority classification → primary capability → skill.
- Context, log, and example text no longer becomes requested work on its own;
  conditional and hypothetical actions stay non-authoritative until current
  request semantics permit them.
- Risk metadata no longer overrides an explicit governing action.

### Fixed

- Conditional, modal, context, and negation authority safety cases.
- Security-risk ownership cases where risk signals previously stole primary
  ownership from the governing action.
- Debug, upgrade, build, and test imperative recognition for explicit
  governing requests.

### Removed

- The executable legacy 6F authority engine and the old route-scoring path.

## [0.2.3]

See git history for changes before the 0.3.0 changelog was started.
