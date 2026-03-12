# Quickstart: Using Pi Team Orchestrator

This guide covers the day-to-day flow: start Pi, choose a team, choose a project, bind them, and inspect status.

Teams can be defined either as:
- `teams/<team>/team.json` using shared roles from `roles/*.md`
- or legacy `teams/<team>/roles/*.md`

## 1) Start Pi with the extension

From this project root:

```bash
pi -e ./src/index.ts
```

Or after package install, start Pi normally.

## 2) See available teams

```text
/team-list
```

Load a team (either form):

```text
/team-load web-app
```

```text
/team-load
```

`/team-load` (no args) opens an interactive picker in TUI mode.

## 3) Create/select projects

Create a new project directory under `~/.pi/projects` and switch to it:

```text
/project-init my-project
```

Optionally bind whatever team is currently active in your session:

```text
/project-init my-project --bind-active-team
```

List known projects:

```text
/project-list
```

Switch active project:

```text
/project-switch my-project
```

Or interactive picker:

```text
/project-switch
```

## 4) Bind active project to a team

```text
/project-bind-team web-app
```

Or interactive picker:

```text
/project-bind-team
```

This also updates active team context and initializes role statuses.

If this is a new project, seed the canonical brief early:

```text
/project-brief Initial brief for this project.
```

If this is an older project from before the file-backed workflow upgrade, reseed once:

```text
/project-migrate
```

## 5) Check current status

Current context:

```text
/team-status
/project-status
```

Optional context-switch + status in one command:

```text
/team-status game-dev
/project-status my-project
```

If no active context exists, these commands can prompt with a picker in TUI mode.

## 6) Workflow visibility commands

```text
/workflow-status
/workflow-resume
/task-status
/agent-status
/handoff-log
/checkpoint-log
/blockers
/decision-log
/session-signoff
/workflow-next
```

Sign a checkpoint manually when you want an explicit resume marker:
(If you omit `--summary`, the orchestrator auto-generates a concise summary.)

```text
/checkpoint-sign --status handoff --role planner --next architect
```

Recommended end-of-session capture:

```text
/session-signoff --status handoff --role planner --next architect
```

`/workflow-resume` is the primary resume view. It shows the exact current role, active task packet, latest checkpoint, gate issues, and default read bundle.
`/workflow-status` is the broader operator view for the full lane.
`/task-status` is the compact machine view of current task ownership and next-role routing.

## 7) Instruct the team via normal chat (no messenger pane)

After team/project context is active, just type normal prompts in CLI (no slash command required), e.g.:

```text
Take this feature through scout -> planner and give me the next implementation handoff.
```

Default behavior in this extension:
- Pi Messenger tool calls are blocked to keep coordination stateful and structured.
- Coordination should be recorded with tools/events (`team_role_status`, `team_handoff`, `team_blocker`, `team_decision_log`).

If you explicitly want messenger for the current session:

```text
/messenger-mode allowed
```

Switch back to default:

```text
/messenger-mode blocked
```

## Typical first-time setup sequence

```text
/team-list
/team-load
/project-init my-project
/project-bind-team
/team-status
/project-status
```

## Notes

- Project candidates are discovered from `~/.pi/projects` plus any projects already seen in orchestrator state.
- Team definitions are loaded from `teams/<team>/team.json` plus shared `roles/*.md`, with legacy `teams/<team>/roles/*.md` still supported.
- Handoff/checkpoint/blocker/decision events are appended to `<project>/.pi-orchestrator/checkpoints.md` for cross-session recovery.
- Canonical workflow files are maintained under `<project>/documents`.
- The live task packet lives at `<project>/documents/working/tasks/<task-id>.md`.
- The compact task registry lives at `<project>/documents/working/task-registry.json`.
- The primary resume packet is the latest checkpoint file under `<project>/documents/checkpoints/`.
- Roles are gated by required files, task packet, evidence, and current task ownership, so the orchestrator can refuse to advance a role when the file state is incomplete.
- The workflow widget shows previous/current/next agent cards horizontally.
- Switch footer mode anytime:

```text
/footer-mode rich
/footer-mode compact
```

- Toggle the card-style team board widget:

```text
/team-board on
/team-board off
```
