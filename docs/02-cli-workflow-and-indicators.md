# CLI Workflow and Indicators

## Problem to solve

A normal coding-agent CLI can feel opaque.
The user wants to know:
- which team is loaded
- which project is active
- which agent is currently responsible
- what task is underway
- whether the flow is blocked or waiting on review

## Minimum CLI indicators

At minimum, the extension should show:

- `Team: web-app | game-dev`
- `Project: <project-name>`
- `Phase: planning | architecture | implementation | review | release`
- `Role: planner | architect | coder | reviewer | ...`
- `Task: short current task description`
- `State: idle | planning | working | blocked | review`
- `Handoffs: <count>`
- `Blockers: <count>`

## Preferred placement

### Interactive mode
Show a compact status line or small overlay/panel.

### Print mode / non-interactive mode
Emit short progress events whenever:
- team loads
- project switches
- role changes
- handoff happens
- blocker appears
- task completes

## Example compact status

`[game-dev] [project: burstfire-remake] [phase: architecture] [role: technical-director] [state: working]`

## Example richer status panel

Team: game-dev
Project: burstfire-remake
Milestone: vertical-slice-combat
Phase: architecture
Current Role: technical-director
Current Task: define authoritative movement/casting boundaries
State: working
Pending Handoffs: 1
Open Blockers: 0

## Slash commands

### Team commands
- `/team-list`
- `/team-load <team>`
- `/team-status`

### Project commands
- `/project-list`
- `/project-switch <project>`
- `/project-bind-team <team>`
- `/project-status`

### Workflow commands
- `/workflow-next`
- `/handoff-log`
- `/agent-status`
- `/blockers`
- `/canon-status`

## Role activity model

Each role should expose one of:
- idle
- queued
- reading
- planning
- working
- reviewing
- blocked
- done

This should be simple enough to inspect in both command output and UI.

## Event moments to surface

The user should be notified when:
- a team is loaded
- a project is switched
- a project has no team bound
- a task enters a new phase
- an agent receives a handoff
- an agent is blocked
- a review fails
- continuity/canon checks fail
- the workflow has no next step
