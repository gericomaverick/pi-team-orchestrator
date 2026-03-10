# Pi Team Orchestrator

A Pi extension for running multi-role team workflows from the normal CLI chat interface.

It supports:
- Team loading from markdown role files (`teams/<team>/roles/*.md`)
- Project context under `~/.pi/projects`
- Session-backed orchestration state (team/project/phase/handoffs/blockers/decisions)
- Structured coordination tools (status, handoff, blocker, decision events)
- Live footer/status indicators

---

## Default behavior (important)

This extension is **chat-first** and **state-first**:

- You communicate to the team through normal CLI chat prompts.
- Coordination is recorded as structured events (not chat-thread inboxes).
- `pi_messenger` is **blocked by default**.

You can override messenger policy per session:

```text
/messenger-mode allowed
```

Return to default:

```text
/messenger-mode blocked
```

---

## Quick start

Start Pi with the extension from this repo root:

```bash
pi -e ./src/index.ts
```

Set context:

```text
/team-list
/team-load web-app
/project-init my-project --bind-active-team
/team-status
/project-status
```

If project already exists:

```text
/project-switch my-project
/project-bind-team web-app
```

### Copy/paste session script (new project smoke test)

Use this directly in a fresh Pi session (replace `my-new-project` and optionally team id):

```text
/messenger-mode blocked
/team-list
/team-load web-app
/project-init my-new-project --bind-active-team
/team-status
/project-status

Scout this project and produce a concise brief: current state, top risks, and unknowns. Then hand off to planner.
Planner: create a milestone plan with acceptance criteria and explicit dependencies.
/session-signoff --role planner --status handoff --next architect
/workflow-next
/agent-status
/handoff-log
/checkpoint-log
/blockers
/decision-log
```

For game workflows, swap `web-app` with `game-dev`.

Checkpoint/handoff events are also written to a project-local file for cross-session recovery:
- `<project>/.pi-orchestrator/checkpoints.md`

### Copy/paste resume script (existing project)

```text
/messenger-mode blocked
/project-switch my-new-project
/team-load web-app
/project-bind-team web-app
/checkpoint-log
/team-status
/workflow-next
/agent-status
/handoff-log
/blockers
```

`/team-status` now falls back to the latest checkpoint log when in-memory state is empty, so Current Role/Role State can recover as e.g. `architect / queued`.

---

## How to communicate with the agents

After team/project context is set, type normal prompts in CLI.

Examples:

```text
Scout this repo for auth and payment touchpoints, then hand off to planner with top risks.
```

```text
Planner: break this into milestones with acceptance criteria and dependencies.
```

```text
Architect + coder: propose a contract-first API change plan and implement the first safe slice.
```

```text
Reviewer: evaluate current changes for release blockers and provide go/no-go recommendation.
```

The extension injects orchestration context at turn start so these prompts are interpreted as team workflow instructions.

---

## Command reference

### Team
- `/team-list`
- `/team-load <team-id>` (or `/team-load` for picker)
- `/team-status` (or `/team-status <team-id>`)
- `/footer-mode <rich|compact>`
- `/team-board <on|off>`
- `/messenger-mode <blocked|allowed>`

### Project
- `/project-list`
- `/project-init <project-id> [--bind-active-team]`
- `/project-switch <project-id>` (or `/project-switch` for picker)
- `/project-bind-team <team-id>` (or `/project-bind-team` for picker)
- `/project-status` (or `/project-status <project-id>`)

### Workflow visibility
- `/agent-status`
- `/handoff-log`
- `/blockers`
- `/decision-log`
- `/checkpoint-log`
- `/session-signoff [--role ... --status ... --next ... --task ... --summary ...]`
- `/workflow-next`

### Manual checkpoint signing
- `/checkpoint-sign [--summary <text>] [--role <role-id>] [--status in_progress|handoff|done|blocked] [--task <task-id>] [--next <role-id>]`

If `--summary` is omitted, the extension auto-generates a concise checkpoint summary.

### End-of-session signoff (recommended)
- `/session-signoff [--summary <text>] [--role <role-id>] [--status in_progress|handoff|done|blocked] [--task <task-id>] [--next <role-id>]`

This signs a checkpoint (default status: `handoff`) and prints a compact resume card with the exact commands to continue in a new session.

---

## Structured coordination primitives

The orchestrator prefers these tools internally:
- `team_role_status`
- `team_handoff`
- `team_blocker`
- `team_decision_log`
- `team_checkpoint_sign`

This keeps team coordination as a workflow/event log instead of conversational message history.

---

## UI indicators

Footer shows live context. Rich mode includes:
- team
- project
- phase
- role + state
- handoff count
- blocker count
- checkpoint count
- messenger policy
- active non-idle roles

A card-style **Team Activity Board** widget is also rendered below the editor to show role cards (state/task/note), with latest-checkpoint fallback when in-memory activity is empty.

Switch modes:

```text
/footer-mode rich
/footer-mode compact
```

Toggle board widget:

```text
/team-board on
/team-board off
```

---

## Development

### Run locally

```bash
pi -e ./src/index.ts
```

### Smoke test

```bash
npm run smoke
```

### Optional: use `just` command shortcuts

A `justfile` is included with Moonglow helpers:

```bash
just --list
just moonglow-new
just moonglow-resume
just moonglow-signoff-auto
```

---

## Package + release

### Verify package contents

```bash
npm run pack:check
```

### Optional local package install test

```bash
pi install /home/openclaw/.pi/projects/pi-team-orchestrator
pi list
```

### Release

Dry run:

```bash
npm run release:dry
```

Publish:

```bash
npm run release
```

With npm OTP:

```bash
NPM_OTP=123456 npm run release
```

Install from npm:

```bash
pi install npm:@gericomaverick/pi-team-orchestrator@0.1.3
```

---

## Additional docs

- `docs/06-quickstart-usage.md`
- `docs/02-cli-workflow-and-indicators.md`
- `docs/03-shared-memory-and-drift-prevention.md`
- `docs/04-data-model.md`
- `docs/05-implementation-plan.md`
