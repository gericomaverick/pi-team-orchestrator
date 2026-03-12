# Pi Team Orchestrator

A Pi extension for running multi-role team workflows from the normal CLI chat interface.

It supports:
- Team loading from shared-role manifests (`teams/<team>/team.json`) and legacy markdown role directories (`teams/<team>/roles/*.md`)
- Project context under `~/.pi/projects`
- Session-backed orchestration state (team/project/phase/handoffs/blockers/decisions)
- Structured coordination tools (status, handoff, blocker, decision events)
- File-backed workflow docs under `<project>/documents`
- Compact on-disk task registry under `<project>/documents/working/task-registry.json`
- Role gates so agents only advance when the brief, checkpoint packet, and task assignment are in place
- Live workflow/status indicators

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
/project-brief Initial brief for this project.
/workflow-status
/task-status
```

If project already exists:

```text
/project-switch my-project
/project-bind-team web-app
/project-migrate
/workflow-status
```

For an older project created before the file-backed workflow upgrade, run `/project-migrate` once after switching/binding. That seeds the new workflow packet and task registry from the old log where possible.

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
/workflow-status
/checkpoint-log
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
/project-migrate
/workflow-status
/task-status
```

`/workflow-status` is now the primary resume command. It points to the exact workflow packet, task registry, gate issues, and role-scoped relevant files.

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

### Primary daily commands
- `/project-brief <summary>`
- `/workflow-status`
- `/task-status`
- `/workflow-next`
- `/session-signoff [--role ... --status ... --next ... --task ... --summary ...]`

These are the commands you should need most of the time. The other workflow commands are mainly for inspection or manual recovery.

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
- `/project-brief <summary>`
- `/project-migrate`
- `/project-status` (or `/project-status <project-id>`)

### Workflow visibility
- `/workflow-status`
- `/workflow-reseed`
- `/task-status`
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

## File-backed workflow model

Every bound project gets a small workflow filesystem:

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

The intended usage is:
- `project-brief.md`: concise canonical overview of the project
- `workflow-status.md`: previous/current/next workflow lane plus gate issues and relevant files
- checkpoint packet: the latest resumable handoff packet for the active task
- `task-registry.json`: compact machine-readable task ownership and next-step state
- `decision-log.md`: concise approved decisions only
- `checkpoints.md`: compatibility audit log, not the main resume surface

Efficiency rules:
- Agents are prompted to read only the role-scoped relevant files by default.
- Archived and superseded checkpoint packets are not part of the default read set.
- The task registry is compact on purpose; it should stay operational, not narrative.
- If a role is missing its required brief/checkpoint/task assignment, gates stop it from advancing.

---

## Shared Roles And Custom Teams

Teams can now be composed from a shared role library.

Primary layout:

```text
roles/<role-id>.md
teams/<team-id>/team.json
```

Example:

```json
{
  "id": "my-team",
  "name": "My Team",
  "roles": ["scout", "planner", "architect", "coder", "reviewer"]
}
```

Each role id in `team.json` resolves to `roles/<role-id>.md` unless a custom `source` is set.

Team manifests can override selected role fields:
- `name`
- `phase`
- `model`
- `thinking`
- `deliverables`
- `handoffTo`

Backward compatibility remains:
- If `teams/<team>/team.json` does not exist, the loader still falls back to `teams/<team>/roles/*.md`.

Project-specific teams are supported, for example:
- `teams/moonglow/team.json`

See also:
- `docs/06-quickstart-usage.md`
- `docs/07-file-backed-workflow.md`

---

## UI indicators

Footer now stays compact and project-focused.

A card-style **Workflow Lane** widget is rendered below the editor to show:
- previous agent
- current agent
- next agent
- status/task/note for each slot

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

Recommended GitHub release flow:

1. Bump `package.json` version and update `CHANGELOG.md`.
2. Push the commit.
3. Push a matching tag such as `v0.2.6`.
4. GitHub Actions creates the GitHub Release.
5. The npm publish workflow also runs from that tag push and publishes from GitHub.

Local dry run:

```bash
npm run release:dry
```

Local publish:

```bash
npm run release
```

Local publish with npm OTP:

```bash
NPM_OTP=123456 npm run release
```

Install from npm:

```bash
pi install npm:@gericomaverick/pi-team-orchestrator@0.2.6
```

GitHub workflows:
- [`.github/workflows/github-release.yml`](.github/workflows/github-release.yml): creates a GitHub Release on `v*` tag push
- [`.github/workflows/npm-publish.yml`](.github/workflows/npm-publish.yml): publishes to npm on `v*` tag push, GitHub Release publish, or manual dispatch

npm package setting:
- If you want GitHub trusted publishing with an emergency token fallback, choose `Require two-factor authentication or a granular access token with bypass 2fa enabled`.
- If you want only trusted publishing and never want token-based fallback, choose `Require two-factor authentication and disallow tokens`.

This repo now supports both trusted publishing and `NPM_TOKEN` fallback in GitHub Actions, so the first option is the pragmatic choice.

---

## Additional docs

- `docs/06-quickstart-usage.md`
- `docs/02-cli-workflow-and-indicators.md`
- `docs/03-shared-memory-and-drift-prevention.md`
- `docs/04-data-model.md`
- `docs/05-implementation-plan.md`
- `docs/08-release-and-publishing.md`
