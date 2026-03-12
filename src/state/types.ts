export type PolicyMode = "loose" | "standard" | "strict";

export type RoleState =
  | "idle"
  | "queued"
  | "reading"
  | "planning"
  | "working"
  | "reviewing"
  | "blocked"
  | "done";

export interface RoleConfig {
  id: string;
  name: string;
  phase: string;
  model?: string;
  thinking?: string;
  handoffTo?: string | string[];
  deliverables?: string[];
}

export interface TeamConfig {
  id: string;
  name: string;
  description?: string;
  roles: RoleConfig[];
  phases: string[];
  defaultPhase?: string;
  handoffRules: { from: string; to: string }[];
  requiredDocsByRole: Record<string, string[]>;
  policyMode: PolicyMode;
}

export interface TaskState {
  id: string;
  title: string;
  description?: string;
  status: "idle" | "planned" | "working" | "review" | "blocked" | "done";
  assignedRoleId?: string;
  acceptanceCriteria?: string[];
  summary?: string;
  nextRoleId?: string;
  checkpointPath?: string;
  relevantPaths?: string[];
  requiredDocIds?: string[];
  updatedAt?: string;
}

export interface RoleStatus {
  roleId: string;
  state: RoleState;
  taskId?: string;
  summary?: string;
  updatedAt?: string;
}

export interface HandoffEvent {
  id: string;
  fromRoleId: string;
  toRoleId: string;
  taskId: string;
  summary: string;
  deliverables: string[];
  blockers?: string[];
  timestamp: string;
}

export interface CanonDoc {
  id: string;
  label: string;
  path: string;
  requiredForRoles?: string[];
}

export type DocumentKind = "canonical" | "checkpoint" | "supporting" | "working" | "archived";
export type DocumentStatus = "active" | "superseded" | "archived";

export interface ProjectDocumentEntry {
  id: string;
  title: string;
  path: string;
  kind: DocumentKind;
  status: DocumentStatus;
  roleIds?: string[];
  taskId?: string;
  summary?: string;
  tags?: string[];
  supersedes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowRoleSlot {
  roleId?: string;
  status?: string;
  taskId?: string;
  summary?: string;
  path?: string;
  updatedAt?: string;
}

export interface WorkflowSnapshot {
  previous?: WorkflowRoleSlot;
  current?: WorkflowRoleSlot;
  next?: WorkflowRoleSlot;
  briefPath?: string;
  decisionLogPath?: string;
  blockersPath?: string;
  latestCheckpointPath?: string;
  taskRegistryPath?: string;
  relevantPaths?: string[];
  gateIssues?: string[];
  updatedAt?: string;
}

export interface DecisionLogEntry {
  id: string;
  title: string;
  decision: string;
  rationale?: string;
  impact?: string;
  timestamp: string;
}

export interface Blocker {
  id: string;
  taskId?: string;
  roleId?: string;
  severity: "low" | "medium" | "high";
  summary: string;
  nextAction?: string;
}

export interface CheckpointEntry {
  id: string;
  timestamp: string;
  roleId: string;
  summary: string;
  status: "in_progress" | "handoff" | "done" | "blocked";
  taskId?: string;
  nextRoleId?: string;
  evidence?: string[];
}

export interface ProjectState {
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
  checkpoints: CheckpointEntry[];
  tasks?: Record<string, TaskState>;
  roleStatuses: Record<string, RoleStatus>;
  workflow?: WorkflowSnapshot;
}

export type FooterMode = "compact" | "rich";
export type MessengerMode = "blocked" | "allowed";
export type TeamBoardMode = "on" | "off";

export interface OrchestratorState {
  activeTeamId?: string;
  activeProjectId?: string;
  footerMode?: FooterMode;
  messengerMode?: MessengerMode;
  teamBoardMode?: TeamBoardMode;
  projects: Record<string, ProjectState>;
}

export interface PersistedOrchestratorState {
  version: 1;
  savedAt: string;
  state: OrchestratorState;
}
