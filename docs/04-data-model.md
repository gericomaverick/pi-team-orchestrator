# Data Model

## TeamConfig

```ts
type TeamConfig = {
  id: string;
  name: string;
  description?: string;
  roles: RoleConfig[];
  phases: string[];
  defaultPhase?: string;
  handoffRules: HandoffRule[];
  requiredDocsByRole: Record<string, string[]>;
  policyMode: "loose" | "standard" | "strict";
};
```

## RoleConfig

```ts
type RoleConfig = {
  id: string;
  name: string;
  phase: string;
  model?: string;
  thinking?: string;
  handoffTo?: string | string[];
  deliverables?: string[];
};
```

## ProjectState

```ts
type ProjectState = {
  id: string;
  name: string;
  cwd?: string;
  boundTeamId?: string;
  milestone?: string;
  currentPhase?: string;
  currentTask?: TaskState;
  blockers: Blocker[];
  canonDocs: CanonDoc[];
  decisions: DecisionLogEntry[];
  handoffs: HandoffEvent[];
  roleStatuses: Record<string, RoleStatus>;
};
```

## TaskState

```ts
type TaskState = {
  id: string;
  title: string;
  description?: string;
  status: "idle" | "planned" | "working" | "review" | "blocked" | "done";
  assignedRoleId?: string;
  acceptanceCriteria?: string[];
};
```

## RoleStatus

```ts
type RoleStatus = {
  roleId: string;
  state: "idle" | "queued" | "reading" | "planning" | "working" | "reviewing" | "blocked" | "done";
  taskId?: string;
  summary?: string;
  updatedAt?: string;
};
```

## HandoffEvent

```ts
type HandoffEvent = {
  id: string;
  fromRoleId: string;
  toRoleId: string;
  taskId: string;
  summary: string;
  deliverables: string[];
  blockers?: string[];
  timestamp: string;
};
```

## CanonDoc

```ts
type CanonDoc = {
  id: string;
  label: string;
  path: string;
  requiredForRoles?: string[];
};
```

## DecisionLogEntry

```ts
type DecisionLogEntry = {
  id: string;
  title: string;
  decision: string;
  rationale?: string;
  impact?: string;
  timestamp: string;
};
```

## Blocker

```ts
type Blocker = {
  id: string;
  taskId?: string;
  roleId?: string;
  severity: "low" | "medium" | "high";
  summary: string;
  nextAction?: string;
};
```
