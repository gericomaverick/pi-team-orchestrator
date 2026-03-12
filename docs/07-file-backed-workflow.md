# File-Backed Workflow

This extension now treats the project filesystem as the primary workflow memory.

## Goals

- Keep resume context small.
- Keep each role on a narrow default read set.
- Preserve a clean handoff packet for the next role.
- Record only durable decisions and active blockers.
- Make older projects migratable without rewriting their repo.

## Project layout

```text
<project>/
  documents/
    index.json
    canonical/
      project-brief.md
      decision-log.md
      workflow-status.md
    checkpoints/
      <timestamp>-<role>-<status>.md
    supporting/
      active-blockers.md
    working/
      task-registry.json
    archive/
  .pi-orchestrator/
    checkpoints.md
```

## What each file is for

- `documents/index.json`
  The machine-readable document index and workflow snapshot.
- `documents/canonical/project-brief.md`
  The concise overview of the project, goals, constraints, and current state.
- `documents/canonical/decision-log.md`
  Approved durable decisions only.
- `documents/canonical/workflow-status.md`
  The human-facing previous/current/next workflow lane plus gate issues and relevant files.
- `documents/checkpoints/*.md`
  The resumable handoff or progress packet for a specific task transition.
- `documents/supporting/active-blockers.md`
  Current blockers and next actions.
- `documents/working/task-registry.json`
  The compact task registry for ownership, status, next role, and checkpoint path.
- `.pi-orchestrator/checkpoints.md`
  Compatibility event log. Useful for recovery, but not the primary resume surface.

## Efficiency model

- Canonical files stay short and durable.
- Working files stay structured and compact.
- Checkpoint packets carry the exact resumable handoff.
- Older checkpoint packets are archived so they stop polluting the default read set.
- Roles are prompted to read only the relevant file subset for their slot and task.

## Role gates

Before a role can advance meaningful work, the orchestrator checks for:

- a bound team
- required canonical files for that role
- a non-placeholder project brief
- an active checkpoint packet for non-scout roles
- a task record in `task-registry.json`
- task ownership matching the current or next role

If those conditions are missing, the role is gated and the extension surfaces the exact issues in `/workflow-status`.

## Daily usage

For a new project:

```text
/team-load <team>
/project-init <project> --bind-active-team
/project-brief <concise overview>
/workflow-status
```

For an existing project:

```text
/project-switch <project>
/team-load <team>
/project-bind-team <team>
/workflow-status
```

For an older pre-upgrade project:

```text
/project-switch <project>
/team-load <team>
/project-bind-team <team>
/project-migrate
/workflow-status
```

At the end of a work chunk:

```text
/session-signoff --role <role> --status handoff --task <task> --next <next-role> --summary <summary>
```

## Recommended operator workflow

Use this as the normal command set:

- `/project-brief`
- `/workflow-status`
- `/task-status`
- `/workflow-next`
- `/session-signoff`

Use the rest only when you need extra inspection or manual recovery.
