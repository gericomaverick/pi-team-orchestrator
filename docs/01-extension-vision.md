# Extension Vision

## Purpose

Create a Pi Mono extension that lets a single Pi session operate like an orchestrated specialist team.

The extension should support multiple team presets, with web app development and game development as the first two.

## Product idea

Pi already behaves like a capable coding agent. This extension adds:
- team identity
- workflow structure
- role selection
- handoff tracking
- project-scoped memory
- drift prevention
- visible work state

The result should feel like:
- one shell
- one current project
- one selected team
- many specialist roles operating through a controlled workflow

## Why this exists

Without orchestration, a single-agent coding workflow tends to drift:
- it forgets which role it is supposed to be operating as
- it skips gates
- it mixes planning and implementation
- it loses project canon
- it is hard to tell what is happening at any moment

This extension should fix that.

## Core design principles

1. Team is explicit
2. Project context is explicit
3. Current role is explicit
4. Hand-offs are explicit
5. Canon docs are explicit
6. Required reading is explicit
7. Visible state beats hidden state
8. Session-backed memory should preserve branching where possible
9. Workflow discipline should be reusable across web and game teams
10. The extension should remain lightweight enough to be practical in the CLI

## Team model

A team is a named collection of role files plus workflow rules.

Examples:
- `web-app`
- `game-dev`

Each team defines:
- available agents
- default workflow phases
- allowed handoffs
- required docs
- default reviewer and continuity checks
- optional UI labels and colors if supported

## Project model

A project is a working directory or project identifier with:
- bound team
- canon docs
- recent decisions
- current milestone
- current active task
- agent status snapshot
- handoff history
- open blockers

A project should have exactly one active team at a time, but teams can be switched deliberately.

## User experience target

At a glance, the user should always be able to answer:
- what project am I in?
- what team is active?
- what role is currently acting?
- what task is being worked?
- what phase are we in?
- what is blocked?
- what happened last?
