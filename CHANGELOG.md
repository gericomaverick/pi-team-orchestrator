# Changelog

All notable changes to this project will be documented in this file.

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
