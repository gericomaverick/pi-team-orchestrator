# Pi Team Orchestrator Starter

A starter design and scaffold for a Pi Mono extension that lets you run an agentic team workflow for either:

- web app development
- game development

The extension is designed around:
- team selection
- project selection and project/team binding
- shared session-backed memory
- task hand-offs between agents
- drift prevention via canon docs and required-reading rules
- visible CLI indicators so you can see what team is loaded and what agents are doing

## Intended goals

This extension should make Pi feel like a team orchestration layer instead of a single-agent CLI.

Core user-facing capabilities:
1. Show which team is currently loaded
2. Show which project is active
3. Bind a team to a project
4. Switch projects cleanly
5. See active task / current responsible agent
6. See recent hand-offs and blockers
7. Enforce required canon docs and workflow steps
8. Reuse the same workflow engine for different team types

## Scope of this starter

This pack contains:
- architecture and workflow docs
- suggested data model
- CLI command design
- drift-prevention rules
- minimal TypeScript scaffold files

The scaffold is intentionally light and should be adapted to the exact Pi Mono extension APIs in the version you are running.

## Suggested package structure

- `docs/` design and workflow docs
- `src/index.ts` extension entry point
- `src/state/` in-session state model and helpers
- `src/commands/` slash commands for team/project/task operations
- `src/ui/` status / activity rendering
- `src/tools/` optional LLM-facing tools for handoffs and memory

## MVP command surface

Implemented commands:
- `/team-status`
- `/team-list`
- `/team-load web-app`
- `/team-load game-dev`
- `/project-list`
- `/project-switch <name>`
- `/project-bind-team <team>`
- `/project-status`
- `/agent-status`
- `/handoff-log`
- `/workflow-next`

## MVP UI indicators

At minimum, expose:
- active team
- active project
- current phase
- current responsible agent
- current task
- agent state: idle / planning / working / blocked / review
- pending handoff count

## Recommended implementation approach

Build this in four stages:

### Stage 1
Project/team state + commands + simple status panel

### Stage 2
Workflow state machine + handoff logging + required-reading enforcement

### Stage 3
Drift prevention + canon docs + approval gates

### Stage 4
Cross-project memory, summaries, and richer activity views

## Install locally (development)

From this project directory:

```bash
pi -e ./src/index.ts
```

Quick smoke run:

```bash
npm run smoke
```

## Package and release

This project is publishable as a Pi package via npm (`package.json` includes a `pi.extensions` manifest pointing to `./src/index.ts`).

### 1) Verify package contents

```bash
npm run pack:check
```

### 2) Optional local install test

```bash
pi install /home/openclaw/.pi/projects/pi-team-orchestrator
pi list
```

### 3) One-command release

Dry run (recommended first):

```bash
npm run release:dry
```

Publish:

```bash
npm run release
```

(Equivalent manual flow: `npm login && npm publish`)

### 4) Install from npm

```bash
pi install npm:pi-team-orchestrator@0.1.0
```

Then start Pi normally and use:

- `/team-list`
- `/team-load web-app`
- `/project-switch <project>`
- `/project-bind-team web-app`
