# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

## [0.1.3] - 2026-03-10

### Added
- New usage guide: `docs/06-quickstart-usage.md` covering team/project setup and day-to-day command flow.
- New `/project-init <project-id>` command to create project directories under `~/.pi/projects` with minimal conventions, then switch context to that project.
- `/project-init` now supports `--bind-active-team` for lightweight project bootstrap without enforcing extra workflow structure.
- New structured coordination tools:
  - `team_blocker` to log workflow blockers
  - `team_decision_log` to append project decisions
  - `team_checkpoint_sign` to sign workflow checkpoints
- New workflow inspection commands:
  - `/blockers`
  - `/decision-log`
  - `/checkpoint-log`
- New checkpoint commands:
  - `/checkpoint-sign ...`
  - `/session-signoff ...` (checkpoint + resume card)
- New `/messenger-mode <blocked|allowed>` command to control Pi Messenger policy.
- Added project-local durable event log at `<project>/.pi-orchestrator/checkpoints.md` for cross-session recovery.

### Changed
- Improved slash-command feedback rendering: command results now show via notifications + a below-editor widget instead of overwriting the input editor.
- Added `/team-load` argument auto-completion and an interactive picker flow when no team id is provided.
- Added argument auto-completion and interactive picker flows for `/project-switch` and `/project-bind-team`.
- Added optional context-switching for `/team-status <team>` and `/project-status <project>`, with completions and picker fallback when no active context exists.
- Added richer footer mode with activity context: `team | project | phase | role | state | handoffs | blockers | checkpoints | messenger | active`.
- Added `/footer-mode <rich|compact>` to switch between rich and compact footer formats.
- Default orchestration now blocks `pi_messenger` tool calls unless explicitly enabled (`/messenger-mode allowed`).
- Injected team/project orchestration guidance into normal chat turns so users can direct the team via regular CLI prompts.
- `/checkpoint-sign` and `team_checkpoint_sign` now support auto-generated concise summaries when summary text is omitted.
- Added `/session-signoff` to record end-of-session checkpoint + print a resume card.
- Team status/footer now recover role hints from latest project checkpoint log when in-memory role state is empty.
- Added card-style Team Activity Board widget (toggle via `/team-board on|off`) to show role-level state/task visibility.
- Added `justfile` shortcuts for Moonglow bootstrap/resume/signoff flows.

## [0.1.2] - 2026-03-10

### Changed
- Bumped release version to prepare the first trusted-publisher CI release.
- No functional runtime changes.

## [0.1.1] - 2026-03-10

### Changed
- Switched npm package name to scoped publish target: `@gericomaverick/pi-team-orchestrator`.
- Updated installation instructions for scoped package install.

## [0.1.0] - 2026-03-10

### Added
- Session-backed orchestrator state persistence using Pi custom session entries.
- Markdown-based team loading from `teams/<team>/roles/*.md`.
- Team normalization support for legacy `wep-app` naming.
- Project registry support from `~/.pi/projects`.
- Compact status indicator rendered via `ctx.ui.setStatus`.
- Packaging metadata for Pi package installation via npm.
- Release helper script (`release.sh`).

### Changed
- Migrated command registration to Pi's `registerCommand` API.
- Implemented reliable command flows for:
  - `/team-list`, `/team-load`, `/team-status`
  - `/project-list`, `/project-switch`, `/project-bind-team`, `/project-status`
  - `/agent-status`, `/handoff-log`, `/workflow-next`
- Updated handoff and role-status tools to persist state and refresh indicators.

### Notes
- Team definitions are source-of-truth markdown role files in `teams/`.
