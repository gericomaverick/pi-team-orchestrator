# Implementation Plan

## Build order

### Step 1: Registry and state
Implement:
- team registry
- role file loader
- project registry
- session-backed current team/project state

Output:
- `/team-list`
- `/team-load`
- `/team-status`
- `/project-switch`
- `/project-bind-team`

### Step 2: Status indicators
Implement:
- compact status renderer
- current role and task state
- handoff counter
- blockers counter
- command to inspect richer detail

Output:
- visible CLI state
- `/agent-status`
- `/handoff-log`
- `/checkpoint-log`
- `/blockers`
- `/decision-log`

### Step 3: Workflow engine
Implement:
- current phase
- allowed handoffs
- handoff event writer
- task assignment helpers

Output:
- `/workflow-next`
- role change and task change visibility

### Step 4: Drift prevention
Implement:
- canon docs registry
- required-doc checks
- policy mode
- continuity warnings
- decision log append behavior

Output:
- `/canon-status`
- warnings or blocks on missing required context

### Step 5: LLM-facing tools
Implement tools for:
- handoff recording
- checkpoint signing
- blocker reporting
- decision-log appends
- role status updates
- project memory summary

Output:
- structured machine-usable workflow state inside sessions

## Suggested MVP acceptance criteria

- User can load either web-app or game-dev team
- User can bind a team to a project
- User can switch projects and see team/project context update
- User can see current phase, role, and task
- User can log a handoff and inspect recent handoffs
- User can see blockers
- Canon doc requirements can produce warnings
- Same extension can operate both team presets without code duplication

## Nice-to-have after MVP

- per-team colors/icons
- richer timeline
- command palette integration
- mini kanban view
- session summary export
- automatic role prompts from role files
- conflict detection between architecture/design docs
