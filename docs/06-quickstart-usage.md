# Quickstart: Using Pi Team Orchestrator

This guide covers the day-to-day flow: start Pi, choose a team, choose a project, bind them, and inspect status.

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
- Team definitions are loaded from `teams/<team>/roles/*.md`.
- Handoff/checkpoint/blocker/decision events are appended to `<project>/.pi-orchestrator/checkpoints.md` for cross-session recovery.
- Footer defaults to rich mode:
  - `team:<id> | project:<id> | phase:<phase> | role:<id> | state:<state> | handoffs:<n> | blockers:<n> | checkpoints:<n> | messenger:<on|off> | active:<role:state,...>`
  - `active:` rotates top non-idle roles (up to 2 shown) across updates.
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
