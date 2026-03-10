# Shared Memory and Drift Prevention

## Why this matters

An agent team is only useful if it stays aligned.

Drift usually happens because:
- roles act without required context
- old decisions get forgotten
- multiple plans conflict
- implementation outruns approved design
- project tone or scope changes silently

## Shared memory layers

### 1. Session state
Short-term state for:
- active team
- active project
- current role
- current phase
- current task
- current blockers
- recent handoffs

### 2. Project memory
Project-scoped durable state for:
- canon docs list
- project summary
- milestone summary
- decision log
- approved architecture notes
- known constraints
- accepted risks

### 3. Role memory
Role-specific context for:
- required docs
- role rules
- active assignment
- last completed output

## Canon docs

Each project should declare a set of canon docs, such as:
- overview
- mvp-scope
- architecture
- combat-vision
- product-principles
- decision-log

Canon docs should be treated as source-of-truth references.

## Required reading

Before a role acts, the extension should know which docs are required.

Examples:

### Planner
- overview
- mvp-scope
- decision-log

### Architect
- planner output
- architecture constraints
- decision-log
- canon docs relevant to system boundaries

### Reviewer
- accepted criteria
- approved plan
- architecture notes
- decision-log

### Continuity Steward
- all canon docs
- most recent outputs
- decision-log

## Drift-prevention rules

1. A role cannot start if required docs are missing
2. A role cannot hand off without producing its output contract
3. Coder cannot start if architecture-required contract is missing when needed
4. Reviewer cannot approve if acceptance criteria are absent
5. Continuity Steward can flag drift against canon docs
6. Team switch should require explicit confirmation or log note when a project already has a different team
7. Decision changes should be appended to a log, not silently replaced

## Shared communication model

Every major action should write an event:
- who acted
- on which task
- what changed
- what was handed off
- what blockers remain
- which docs were used

This can power:
- handoff log
- session compaction
- project summary
- audit history

## Recommended policy modes

### Loose
Helpful guidance only

### Standard
Warn on missing canon, allow override

### Strict
Block workflow actions if required steps or docs are missing

Use `standard` by default.
