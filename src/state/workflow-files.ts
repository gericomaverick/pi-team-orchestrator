import fs from "node:fs";
import path from "node:path";
import { readProjectLogTail } from "./project-log";
import type {
  Blocker,
  CanonDoc,
  CheckpointEntry,
  DecisionLogEntry,
  ProjectDocumentEntry,
  ProjectState,
  TaskState,
  TeamConfig,
  WorkflowSnapshot,
} from "./types";

interface WorkflowDocumentIndex {
  version: 1;
  updatedAt: string;
  documents: ProjectDocumentEntry[];
  workflow?: WorkflowSnapshot;
}

interface TaskRegistry {
  version: 1;
  updatedAt: string;
  tasks: TaskState[];
}

const DOCUMENTS_DIR = "documents";
const INDEX_FILE = "index.json";
const TASK_REGISTRY_FILE = "task-registry.json";
const WORKFLOW_STATUS_FILE = "workflow-status.md";
const CANONICAL_DIR = "canonical";
const CHECKPOINTS_DIR = "checkpoints";
const SUPPORTING_DIR = "supporting";
const WORKING_DIR = "working";
const ARCHIVE_DIR = "archive";

const PROJECT_BRIEF_ID = "project-brief";
const DECISION_LOG_ID = "decision-log";
const WORKFLOW_STATUS_ID = "workflow-status";
const ACTIVE_BLOCKERS_ID = "active-blockers";
const TASK_REGISTRY_ID = "task-registry";

const ROLE_DEFAULT_DOCS: Record<string, string[]> = {
  scout: [PROJECT_BRIEF_ID, WORKFLOW_STATUS_ID],
  planner: [PROJECT_BRIEF_ID, DECISION_LOG_ID, WORKFLOW_STATUS_ID, TASK_REGISTRY_ID],
  architect: [PROJECT_BRIEF_ID, DECISION_LOG_ID, WORKFLOW_STATUS_ID, TASK_REGISTRY_ID],
  coder: [PROJECT_BRIEF_ID, DECISION_LOG_ID, WORKFLOW_STATUS_ID, TASK_REGISTRY_ID],
  reviewer: [PROJECT_BRIEF_ID, DECISION_LOG_ID, WORKFLOW_STATUS_ID, ACTIVE_BLOCKERS_ID, TASK_REGISTRY_ID],
  "continuity-steward": [PROJECT_BRIEF_ID, DECISION_LOG_ID, WORKFLOW_STATUS_ID, ACTIVE_BLOCKERS_ID, TASK_REGISTRY_ID],
  documentor: [PROJECT_BRIEF_ID, DECISION_LOG_ID, WORKFLOW_STATUS_ID, TASK_REGISTRY_ID],
  "release-manager": [PROJECT_BRIEF_ID, DECISION_LOG_ID, WORKFLOW_STATUS_ID, ACTIVE_BLOCKERS_ID, TASK_REGISTRY_ID],
  "technical-director": [PROJECT_BRIEF_ID, DECISION_LOG_ID, WORKFLOW_STATUS_ID, ACTIVE_BLOCKERS_ID, TASK_REGISTRY_ID],
  "systems-designer": [PROJECT_BRIEF_ID, DECISION_LOG_ID, WORKFLOW_STATUS_ID, TASK_REGISTRY_ID],
  "combat-designer": [PROJECT_BRIEF_ID, DECISION_LOG_ID, WORKFLOW_STATUS_ID, TASK_REGISTRY_ID],
  "world-atmosphere-designer": [PROJECT_BRIEF_ID, DECISION_LOG_ID, WORKFLOW_STATUS_ID, TASK_REGISTRY_ID],
  "world-level-designer": [PROJECT_BRIEF_ID, DECISION_LOG_ID, WORKFLOW_STATUS_ID, TASK_REGISTRY_ID],
  "multiplayer-persistence-engineer": [PROJECT_BRIEF_ID, DECISION_LOG_ID, WORKFLOW_STATUS_ID, ACTIVE_BLOCKERS_ID, TASK_REGISTRY_ID],
  "qa-balance-analyst": [PROJECT_BRIEF_ID, DECISION_LOG_ID, WORKFLOW_STATUS_ID, ACTIVE_BLOCKERS_ID, TASK_REGISTRY_ID],
  "build-engineer": [PROJECT_BRIEF_ID, WORKFLOW_STATUS_ID, ACTIVE_BLOCKERS_ID, TASK_REGISTRY_ID],
  "mpe-coder": [PROJECT_BRIEF_ID, DECISION_LOG_ID, WORKFLOW_STATUS_ID, ACTIVE_BLOCKERS_ID, TASK_REGISTRY_ID],
  "product-owner": [PROJECT_BRIEF_ID, DECISION_LOG_ID, WORKFLOW_STATUS_ID, ACTIVE_BLOCKERS_ID, TASK_REGISTRY_ID],
};

const BRIEF_PLACEHOLDER = "Capture the initial brief, current scope, and constraints here.";

export function ensureProjectWorkflowFiles(project: ProjectState): WorkflowDocumentIndex | undefined {
  if (!project.cwd) return undefined;

  const now = new Date().toISOString();
  const documentsRoot = getDocumentsRoot(project.cwd);
  const canonicalRoot = path.join(documentsRoot, CANONICAL_DIR);
  const checkpointsRoot = path.join(documentsRoot, CHECKPOINTS_DIR);
  const supportingRoot = path.join(documentsRoot, SUPPORTING_DIR);
  const workingRoot = path.join(documentsRoot, WORKING_DIR);
  const archiveRoot = path.join(documentsRoot, ARCHIVE_DIR);

  for (const dir of [documentsRoot, canonicalRoot, checkpointsRoot, supportingRoot, workingRoot, archiveRoot]) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const index = loadWorkflowDocumentIndex(project.cwd) ?? {
    version: 1 as const,
    updatedAt: now,
    documents: [],
    workflow: project.workflow ? { ...project.workflow, updatedAt: project.workflow.updatedAt ?? now } : { updatedAt: now },
  };

  const projectBriefPath = path.join(canonicalRoot, "project-brief.md");
  if (!fs.existsSync(projectBriefPath)) {
    fs.writeFileSync(
      projectBriefPath,
      [
        "# Project Brief",
        "",
        "## Overview",
        BRIEF_PLACEHOLDER,
        "",
        "## Goals",
        "-",
        "",
        "## Constraints",
        "-",
        "",
        "## Current State",
        "-",
        "",
      ].join("\n"),
      "utf8",
    );
  }
  upsertDocument(index, {
    id: PROJECT_BRIEF_ID,
    title: "Project Brief",
    path: projectBriefPath,
    kind: "canonical",
    status: "active",
    summary: "Initial brief, goals, constraints, and current state.",
    createdAt: now,
    updatedAt: fileUpdatedAt(projectBriefPath, now),
  });

  const decisionLogPath = path.join(canonicalRoot, "decision-log.md");
  if (!fs.existsSync(decisionLogPath)) {
    fs.writeFileSync(decisionLogPath, ["# Decision Log", "", "Concise project decisions with rationale and impact.", ""].join("\n"), "utf8");
  }
  upsertDocument(index, {
    id: DECISION_LOG_ID,
    title: "Decision Log",
    path: decisionLogPath,
    kind: "canonical",
    status: "active",
    summary: "Approved decisions with rationale and impact.",
    createdAt: now,
    updatedAt: fileUpdatedAt(decisionLogPath, now),
  });

  const blockersPath = path.join(supportingRoot, "active-blockers.md");
  if (!fs.existsSync(blockersPath)) {
    fs.writeFileSync(blockersPath, ["# Active Blockers", "", "- None", ""].join("\n"), "utf8");
  }
  upsertDocument(index, {
    id: ACTIVE_BLOCKERS_ID,
    title: "Active Blockers",
    path: blockersPath,
    kind: "supporting",
    status: "active",
    summary: "Current open blockers and immediate next actions.",
    createdAt: now,
    updatedAt: fileUpdatedAt(blockersPath, now),
  });

  const taskRegistryPath = getTaskRegistryPath(project.cwd);
  if (!fs.existsSync(taskRegistryPath)) {
    saveTaskRegistry(project.cwd, { version: 1, updatedAt: now, tasks: [] });
  }
  upsertDocument(index, {
    id: TASK_REGISTRY_ID,
    title: "Task Registry",
    path: taskRegistryPath,
    kind: "working",
    status: "active",
    summary: "Compact registry of current and recent workflow tasks.",
    createdAt: now,
    updatedAt: fileUpdatedAt(taskRegistryPath, now),
  });

  index.workflow = {
    ...(index.workflow ?? {}),
    briefPath: index.workflow?.briefPath ?? projectBriefPath,
    decisionLogPath: index.workflow?.decisionLogPath ?? decisionLogPath,
    blockersPath: index.workflow?.blockersPath ?? blockersPath,
    taskRegistryPath: index.workflow?.taskRegistryPath ?? taskRegistryPath,
    updatedAt: now,
  };

  saveWorkflowDocumentIndex(project.cwd, index);
  applyIndexToProject(project, index);
  writeWorkflowStatusDoc(project, index);
  return loadWorkflowDocumentIndex(project.cwd) ?? index;
}

export function hydrateProjectFromFiles(project: ProjectState) {
  const index = ensureProjectWorkflowFiles(project);
  if (!index) return;
  applyIndexToProject(project, index);
}

export function loadWorkflowDocumentIndex(projectCwd: string | undefined): WorkflowDocumentIndex | undefined {
  if (!projectCwd) return undefined;
  const filePath = path.join(getDocumentsRoot(projectCwd), INDEX_FILE);
  if (!fs.existsSync(filePath)) return undefined;

  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as WorkflowDocumentIndex;
    if (parsed?.version !== 1 || !Array.isArray(parsed.documents)) return undefined;
    return parsed;
  } catch {
    return undefined;
  }
}

export function getTaskRegistryPath(projectCwd: string | undefined) {
  if (!projectCwd) return undefined;
  return path.join(getDocumentsRoot(projectCwd), WORKING_DIR, TASK_REGISTRY_FILE);
}

export function syncWorkflowFiles(project: ProjectState, team?: TeamConfig) {
  const index = ensureProjectWorkflowFiles(project);
  if (!index || !project.cwd) return;

  const currentRoleId = project.workflow?.current?.roleId ?? project.workflow?.next?.roleId;
  if (currentRoleId && team) {
    project.currentPhase = team.roles.find((role) => role.id === currentRoleId)?.phase ?? project.currentPhase;
  }

  if (project.currentTask) {
    upsertTaskRecord(project, {
      id: project.currentTask.id,
      title: project.currentTask.title,
      status: project.currentTask.status,
      assignedRoleId: project.currentTask.assignedRoleId,
      summary: project.workflow?.current?.summary ?? project.currentTask.summary,
      nextRoleId: project.workflow?.next?.roleId,
      checkpointPath: project.workflow?.latestCheckpointPath,
      relevantPaths: getRelevantDocumentPaths(project, currentRoleId, project.currentTask.id),
      requiredDocIds: currentRoleId && team ? team.requiredDocsByRole[currentRoleId] ?? [PROJECT_BRIEF_ID, WORKFLOW_STATUS_ID] : undefined,
      updatedAt: new Date().toISOString(),
    });
  }

  const relevantPaths = getRelevantDocumentPaths(project, currentRoleId, project.currentTask?.id);
  const predictedNextRoleId =
    project.workflow?.next?.roleId ??
    predictNextRoleId(team, project.workflow?.current?.roleId ?? project.currentTask?.assignedRoleId);
  const gateIssues = currentRoleId ? getRoleGateIssues(project, team, currentRoleId, project.currentTask?.id) : [];

  project.workflow = {
    ...(project.workflow ?? {}),
    briefPath: project.workflow?.briefPath ?? findDocument(index, PROJECT_BRIEF_ID)?.path,
    decisionLogPath: project.workflow?.decisionLogPath ?? findDocument(index, DECISION_LOG_ID)?.path,
    blockersPath: project.workflow?.blockersPath ?? findDocument(index, ACTIVE_BLOCKERS_ID)?.path,
    taskRegistryPath: project.workflow?.taskRegistryPath ?? findDocument(index, TASK_REGISTRY_ID)?.path,
    next:
      predictedNextRoleId && !project.workflow?.next?.roleId
        ? {
            roleId: predictedNextRoleId,
            status: "queued",
            taskId: project.currentTask?.id,
            updatedAt: new Date().toISOString(),
          }
        : project.workflow?.next,
    relevantPaths,
    gateIssues,
    updatedAt: new Date().toISOString(),
  };

  index.workflow = project.workflow;
  index.updatedAt = project.workflow.updatedAt ?? index.updatedAt;
  saveWorkflowDocumentIndex(project.cwd, index);
  syncBlockersDoc(project);
  writeWorkflowStatusDoc(project, loadWorkflowDocumentIndex(project.cwd) ?? index);
  applyIndexToProject(project, loadWorkflowDocumentIndex(project.cwd) ?? index);
}

export function writeProjectBrief(
  project: ProjectState,
  summary: string,
  options?: { goals?: string[]; constraints?: string[]; currentState?: string[]; roleId?: string },
): string | undefined {
  const index = ensureProjectWorkflowFiles(project);
  if (!index || !project.cwd) return undefined;

  const now = new Date().toISOString();
  const briefPath = findDocument(index, PROJECT_BRIEF_ID)?.path ?? path.join(getDocumentsRoot(project.cwd), CANONICAL_DIR, "project-brief.md");
  const goals = options?.goals?.length ? options.goals : ["-"];
  const constraints = options?.constraints?.length ? options.constraints : ["-"];
  const currentState = options?.currentState?.length ? options.currentState : ["-"];

  fs.writeFileSync(
    briefPath,
    [
      "# Project Brief",
      "",
      `Updated: ${now}`,
      options?.roleId ? `Last updated by: ${options.roleId}` : undefined,
      "",
      "## Overview",
      summary.trim(),
      "",
      "## Goals",
      ...goals,
      "",
      "## Constraints",
      ...constraints,
      "",
      "## Current State",
      ...currentState,
      "",
    ]
      .filter((line) => line !== undefined)
      .join("\n"),
    "utf8",
  );

  upsertDocument(index, {
    id: PROJECT_BRIEF_ID,
    title: "Project Brief",
    path: briefPath,
    kind: "canonical",
    status: "active",
    summary: summary.trim(),
    createdAt: now,
    updatedAt: now,
  });

  project.workflow = {
    ...(project.workflow ?? {}),
    briefPath,
    updatedAt: now,
  };
  index.workflow = project.workflow;
  index.updatedAt = now;
  saveWorkflowDocumentIndex(project.cwd, index);
  writeWorkflowStatusDoc(project, index);
  applyIndexToProject(project, loadWorkflowDocumentIndex(project.cwd) ?? index);
  return briefPath;
}

export function appendDecisionDoc(project: ProjectState, entry: DecisionLogEntry): string | undefined {
  const index = ensureProjectWorkflowFiles(project);
  if (!index || !project.cwd) return undefined;

  const decisionLogPath = findDocument(index, DECISION_LOG_ID)?.path ?? path.join(getDocumentsRoot(project.cwd), CANONICAL_DIR, "decision-log.md");
  const section = [
    `## ${entry.title}`,
    `- Timestamp: ${entry.timestamp}`,
    `- Decision: ${entry.decision}`,
    entry.rationale ? `- Why: ${entry.rationale}` : undefined,
    entry.impact ? `- Impact: ${entry.impact}` : undefined,
    "",
  ]
    .filter((line) => line !== undefined)
    .join("\n");

  fs.appendFileSync(decisionLogPath, section, "utf8");

  upsertDocument(index, {
    id: DECISION_LOG_ID,
    title: "Decision Log",
    path: decisionLogPath,
    kind: "canonical",
    status: "active",
    summary: `Latest decision: ${entry.title}`,
    createdAt: entry.timestamp,
    updatedAt: entry.timestamp,
  });

  project.workflow = {
    ...(project.workflow ?? {}),
    decisionLogPath,
    updatedAt: entry.timestamp,
  };
  index.workflow = project.workflow;
  index.updatedAt = entry.timestamp;
  saveWorkflowDocumentIndex(project.cwd, index);
  writeWorkflowStatusDoc(project, index);
  applyIndexToProject(project, loadWorkflowDocumentIndex(project.cwd) ?? index);
  return decisionLogPath;
}

export function syncBlockersDoc(project: ProjectState): string | undefined {
  const index = ensureProjectWorkflowFiles(project);
  if (!index || !project.cwd) return undefined;

  const blockersPath = findDocument(index, ACTIVE_BLOCKERS_ID)?.path ?? path.join(getDocumentsRoot(project.cwd), SUPPORTING_DIR, "active-blockers.md");
  const lines = ["# Active Blockers", ""];

  if (!project.blockers.length) {
    lines.push("- None", "");
  } else {
    for (const blocker of project.blockers.slice(-20)) {
      lines.push(
        `- [${blocker.severity}] ${blocker.summary}${blocker.roleId ? ` | role: ${blocker.roleId}` : ""}${blocker.taskId ? ` | task: ${blocker.taskId}` : ""}${blocker.nextAction ? ` | next: ${blocker.nextAction}` : ""}`,
      );
    }
    lines.push("");
  }

  fs.writeFileSync(blockersPath, lines.join("\n"), "utf8");

  upsertDocument(index, {
    id: ACTIVE_BLOCKERS_ID,
    title: "Active Blockers",
    path: blockersPath,
    kind: "supporting",
    status: "active",
    summary: project.blockers.length ? `${project.blockers.length} blocker(s)` : "No open blockers.",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  project.workflow = {
    ...(project.workflow ?? {}),
    blockersPath,
    updatedAt: new Date().toISOString(),
  };
  index.workflow = project.workflow;
  index.updatedAt = project.workflow.updatedAt ?? index.updatedAt;
  saveWorkflowDocumentIndex(project.cwd, index);
  return blockersPath;
}

export function writeCheckpointPacket(
  project: ProjectState,
  checkpoint: CheckpointEntry,
  options?: { fromRoleId?: string; blockers?: Blocker[]; evidence?: string[]; team?: TeamConfig },
): string | undefined {
  const index = ensureProjectWorkflowFiles(project);
  if (!index || !project.cwd) return undefined;

  const safeTimestamp = checkpoint.timestamp.replace(/[:.]/g, "-");
  const fileName = `${safeTimestamp}-${checkpoint.roleId}-${checkpoint.status}.md`;
  const packetPath = path.join(getDocumentsRoot(project.cwd), CHECKPOINTS_DIR, fileName);
  const blockers = options?.blockers ?? project.blockers;
  const evidence = options?.evidence ?? checkpoint.evidence ?? [];
  const nextRoleId = checkpoint.nextRoleId ?? predictNextRoleId(options?.team, checkpoint.roleId) ?? project.workflow?.next?.roleId;
  const taskLabel = checkpoint.taskId ?? project.currentTask?.title ?? "none";

  archiveSupersededCheckpointDocuments(index, project.cwd, checkpoint.taskId, checkpoint.id);

  fs.writeFileSync(
    packetPath,
    [
      `# Checkpoint: ${checkpoint.roleId}`,
      "",
      `- Timestamp: ${checkpoint.timestamp}`,
      `- Status: ${checkpoint.status}`,
      `- Task: ${taskLabel}`,
      `- From: ${options?.fromRoleId ?? checkpoint.roleId}`,
      `- Next: ${nextRoleId ?? "none"}`,
      "",
      "## Summary",
      checkpoint.summary,
      "",
      "## Open Blockers",
      ...(blockers.length
        ? blockers.slice(-5).map((blocker) => `- [${blocker.severity}] ${blocker.summary}${blocker.nextAction ? ` | next: ${blocker.nextAction}` : ""}`)
        : ["- None"]),
      "",
      "## Evidence",
      ...(evidence.length ? evidence.map((item) => `- ${item}`) : ["- None"]),
      "",
    ].join("\n"),
    "utf8",
  );

  upsertDocument(index, {
    id: checkpoint.id,
    title: `Checkpoint ${checkpoint.roleId} (${checkpoint.status})`,
    path: packetPath,
    kind: "checkpoint",
    status: "active",
    roleIds: compactRoleIds([checkpoint.roleId, nextRoleId]),
    taskId: checkpoint.taskId,
    summary: checkpoint.summary,
    tags: [checkpoint.status],
    createdAt: checkpoint.timestamp,
    updatedAt: checkpoint.timestamp,
  });

  project.workflow = {
    ...(project.workflow ?? {}),
    previous: {
      roleId: checkpoint.roleId,
      status: checkpoint.status,
      taskId: checkpoint.taskId,
      summary: checkpoint.summary,
      path: packetPath,
      updatedAt: checkpoint.timestamp,
    },
    current: nextRoleId
      ? {
          roleId: nextRoleId,
          status: checkpoint.status === "handoff" ? "queued" : "blocked",
          taskId: checkpoint.taskId,
          summary: checkpoint.summary,
          path: packetPath,
          updatedAt: checkpoint.timestamp,
        }
      : {
          roleId: checkpoint.roleId,
          status: checkpoint.status,
          taskId: checkpoint.taskId,
          summary: checkpoint.summary,
          path: packetPath,
          updatedAt: checkpoint.timestamp,
        },
    next: nextRoleId
      ? {
          roleId: predictNextRoleId(options?.team, nextRoleId),
          status: "queued",
          taskId: checkpoint.taskId,
          updatedAt: checkpoint.timestamp,
        }
      : project.workflow?.next,
    latestCheckpointPath: packetPath,
    updatedAt: checkpoint.timestamp,
  };

  if (checkpoint.taskId || project.currentTask) {
    const taskId = checkpoint.taskId ?? project.currentTask?.id ?? "current-scope";
    const title = project.currentTask?.title ?? taskId;
    upsertTaskRecord(project, {
      id: taskId,
      title,
      status: normalizeTaskStatus(checkpoint.status),
      assignedRoleId: nextRoleId ?? checkpoint.roleId,
      summary: checkpoint.summary,
      nextRoleId,
      checkpointPath: packetPath,
      relevantPaths: compactStrings([packetPath, project.workflow?.briefPath, project.workflow?.decisionLogPath, project.workflow?.blockersPath]),
      updatedAt: checkpoint.timestamp,
    });
  }

  index.workflow = project.workflow;
  index.updatedAt = checkpoint.timestamp;
  saveWorkflowDocumentIndex(project.cwd, index);
  syncBlockersDoc(project);
  writeWorkflowStatusDoc(project, loadWorkflowDocumentIndex(project.cwd) ?? index);
  applyIndexToProject(project, loadWorkflowDocumentIndex(project.cwd) ?? index);
  return packetPath;
}

export function upsertTaskRecord(project: ProjectState, task: TaskState): string | undefined {
  if (!project.cwd) return undefined;

  const registry = loadTaskRegistry(project.cwd) ?? { version: 1 as const, updatedAt: new Date().toISOString(), tasks: [] };
  const updatedAt = task.updatedAt ?? new Date().toISOString();
  const nextRoleId = task.nextRoleId ?? task.assignedRoleId;
  const incoming: TaskState = {
    ...task,
    nextRoleId,
    updatedAt,
  };

  const existing = registry.tasks.find((entry) => entry.id === incoming.id);
  if (existing) {
    Object.assign(existing, incoming);
  } else {
    registry.tasks.push(incoming);
  }

  registry.updatedAt = updatedAt;
  saveTaskRegistry(project.cwd, registry);
  project.tasks = Object.fromEntries(registry.tasks.map((entry) => [entry.id, entry]));
  return getTaskRegistryPath(project.cwd);
}

export function getRelevantDocumentPaths(project: ProjectState, roleId?: string, taskId?: string): string[] {
  const index = loadWorkflowDocumentIndex(project.cwd);
  if (!index) return [];
  return selectRelevantDocumentPaths(index, roleId ?? project.workflow?.current?.roleId ?? project.workflow?.next?.roleId, taskId ?? project.currentTask?.id);
}

export function getRoleGateIssues(project: ProjectState, team: TeamConfig | undefined, roleId: string, taskId?: string): string[] {
  if (!team) return ["No bound team for active project."];

  const issues: string[] = [];
  const requiredDocIds = team.requiredDocsByRole[roleId] ?? [PROJECT_BRIEF_ID, WORKFLOW_STATUS_ID];
  const index = loadWorkflowDocumentIndex(project.cwd);
  const registry = loadTaskRegistry(project.cwd);
  const effectiveTaskId = taskId ?? project.currentTask?.id ?? project.workflow?.current?.taskId ?? project.workflow?.next?.taskId;

  if (!index) {
    issues.push("Workflow document index is missing.");
    return issues;
  }

  for (const docId of requiredDocIds) {
    const doc = findDocument(index, docId);
    if (!doc || doc.status !== "active") {
      issues.push(`Missing required document '${docId}'.`);
      continue;
    }
    if (docId === PROJECT_BRIEF_ID && isPlaceholderBrief(doc.path)) {
      issues.push("Project brief is still a placeholder.");
    }
  }

  if (project.workflow?.current?.roleId && ![project.workflow.current.roleId, project.workflow?.next?.roleId].includes(roleId)) {
    issues.push(`Role '${roleId}' is not the current or next workflow owner.`);
  }

  if (effectiveTaskId) {
    const task = registry?.tasks.find((entry) => entry.id === effectiveTaskId);
    if (!task) {
      issues.push(`Task '${effectiveTaskId}' is not present in the task registry.`);
    } else if (task.assignedRoleId && task.assignedRoleId !== roleId && task.nextRoleId !== roleId) {
      issues.push(`Task '${effectiveTaskId}' is assigned to '${task.assignedRoleId}', not '${roleId}'.`);
    }
  } else if (roleId !== "scout" && roleId !== "product-owner") {
    issues.push("No active task is assigned.");
  }

  if (roleId !== "scout" && roleId !== "product-owner" && !project.workflow?.latestCheckpointPath) {
    issues.push("No active checkpoint packet is available for resume.");
  }

  return issues;
}

export function canRoleTransition(project: ProjectState, team: TeamConfig | undefined, roleId: string, taskId?: string) {
  const issues = getRoleGateIssues(project, team, roleId, taskId);
  const mode = team?.policyMode ?? "standard";
  return {
    issues,
    blocked: mode !== "loose" && issues.length > 0,
  };
}

export function predictNextRoleId(team: TeamConfig | undefined, roleId: string | undefined): string | undefined {
  if (!team || !roleId) return undefined;
  return team.handoffRules.find((rule) => rule.from === roleId)?.to;
}

export function migrateProjectWorkflow(
  project: ProjectState,
  team?: TeamConfig,
): { summary: string; checkpointPath?: string; taskRegistryPath?: string; briefPath?: string; warnings: string[] } {
  const warnings: string[] = [];
  const index = ensureProjectWorkflowFiles(project);
  if (!index || !project.cwd) {
    return { summary: "Project workflow files could not be initialized.", warnings: ["Project path is missing."] };
  }

  let briefPath = project.workflow?.briefPath;
  if (briefPath && isPlaceholderBrief(briefPath)) {
    const seeded = seedProjectBriefFromExistingDocs(project);
    if (!seeded) warnings.push("Project brief remains a placeholder; no existing source brief was found.");
    briefPath = seeded ?? briefPath;
  }

  const latest = inferLatestLegacyCheckpoint(project.cwd);
  let checkpointPath: string | undefined;
  if (latest) {
    const entry: CheckpointEntry = {
      id: `checkpoint-${Date.now()}`,
      timestamp: latest.timestamp,
      roleId: latest.roleId,
      summary: latest.summary,
      status: latest.status,
      taskId: latest.taskId,
      nextRoleId: latest.nextRoleId,
      evidence: latest.evidence,
    };
    checkpointPath = writeCheckpointPacket(project, entry, { team });
    project.currentTask = latest.taskId
      ? {
          id: latest.taskId,
          title: latest.taskId,
          status: normalizeTaskStatus(latest.status),
          assignedRoleId: latest.nextRoleId ?? latest.roleId,
          summary: latest.summary,
          nextRoleId: latest.nextRoleId,
          checkpointPath,
          updatedAt: latest.timestamp,
        }
      : project.currentTask;
    if (project.currentTask) {
      upsertTaskRecord(project, project.currentTask);
    }
  } else {
    warnings.push("No legacy checkpoint or handoff line could be parsed from .pi-orchestrator/checkpoints.md.");
  }

  syncWorkflowFiles(project, team);
  return {
    summary: latest
      ? `Reseeded workflow from legacy ${latest.status} event: ${latest.roleId}${latest.nextRoleId ? ` -> ${latest.nextRoleId}` : ""}${latest.taskId ? ` | task ${latest.taskId}` : ""}`
      : "Initialized workflow files but found no legacy event to reseed.",
    checkpointPath,
    taskRegistryPath: project.workflow?.taskRegistryPath,
    briefPath,
    warnings,
  };
}

function writeWorkflowStatusDoc(project: ProjectState, index: WorkflowDocumentIndex) {
  if (!project.cwd) return;

  const statusPath = path.join(getDocumentsRoot(project.cwd), CANONICAL_DIR, WORKFLOW_STATUS_FILE);
  const current = index.workflow?.current;
  const previous = index.workflow?.previous;
  const next = index.workflow?.next;
  const relevantPaths = selectRelevantDocumentPaths(index, current?.roleId ?? next?.roleId, current?.taskId ?? next?.taskId);
  const gateIssues = index.workflow?.gateIssues ?? [];

  fs.writeFileSync(
    statusPath,
    [
      "# Workflow Status",
      "",
      `Updated: ${index.workflow?.updatedAt ?? index.updatedAt}`,
      `Project: ${project.name}`,
      `Phase: ${project.currentPhase ?? "none"}`,
      "",
      "## Previous Agent",
      formatWorkflowRole(previous),
      "",
      "## Current Agent",
      formatWorkflowRole(current),
      "",
      "## Next Agent",
      formatWorkflowRole(next),
      "",
      `Task Registry: ${index.workflow?.taskRegistryPath ?? "none"}`,
      "",
      "## Gate Issues",
      ...(gateIssues.length ? gateIssues.map((item) => `- ${item}`) : ["- None"]),
      "",
      "## Relevant Files",
      ...(relevantPaths.length ? relevantPaths.map((item) => `- ${item}`) : ["- None"]),
      "",
    ].join("\n"),
    "utf8",
  );

  upsertDocument(index, {
    id: WORKFLOW_STATUS_ID,
    title: "Workflow Status",
    path: statusPath,
    kind: "canonical",
    status: "active",
    summary: `${current?.roleId ?? "none"} is current; ${next?.roleId ?? "none"} is next.`,
    createdAt: index.updatedAt,
    updatedAt: index.workflow?.updatedAt ?? index.updatedAt,
  });
  saveWorkflowDocumentIndex(project.cwd, index);
}

function applyIndexToProject(project: ProjectState, index: WorkflowDocumentIndex) {
  project.workflow = index.workflow;
  project.canonDocs = index.documents
    .filter((entry) => entry.kind === "canonical" && entry.status === "active")
    .map(
      (entry): CanonDoc => ({
        id: entry.id,
        label: entry.title,
        path: entry.path,
        requiredForRoles: entry.roleIds,
      }),
    );

  const registry = loadTaskRegistry(project.cwd);
  project.tasks = Object.fromEntries((registry?.tasks ?? []).map((entry) => [entry.id, entry]));

  const currentTaskId = project.workflow?.current?.taskId ?? project.workflow?.next?.taskId;
  if (currentTaskId && project.tasks[currentTaskId]) {
    project.currentTask = project.tasks[currentTaskId];
  } else if (project.workflow?.current?.taskId) {
    project.currentTask = {
      id: project.workflow.current.taskId,
      title: project.workflow.current.taskId,
      status: normalizeTaskStatus(project.workflow.current.status),
      assignedRoleId: project.workflow.current.roleId,
      summary: project.workflow.current.summary,
      updatedAt: project.workflow.current.updatedAt,
    };
  }
}

function selectRelevantDocumentPaths(index: WorkflowDocumentIndex, roleId?: string, taskId?: string): string[] {
  const entries = index.documents.filter((entry) => entry.status === "active" && entry.kind !== "archived");
  const seen = new Set<string>();
  const ordered: string[] = [];
  const add = (entry: ProjectDocumentEntry | undefined) => {
    if (!entry || seen.has(entry.path)) return;
    seen.add(entry.path);
    ordered.push(entry.path);
  };

  const defaults = roleId ? ROLE_DEFAULT_DOCS[roleId] ?? [PROJECT_BRIEF_ID, WORKFLOW_STATUS_ID] : [PROJECT_BRIEF_ID, WORKFLOW_STATUS_ID];
  for (const id of defaults) add(findDocument(index, id));

  if (taskId) {
    for (const entry of entries.filter((item) => item.taskId === taskId)) add(entry);
  }

  if (index.workflow?.latestCheckpointPath) {
    add(entries.find((entry) => entry.path === index.workflow?.latestCheckpointPath));
  }

  for (const entry of entries) {
    if (entry.kind === "checkpoint") continue;
    if (!roleId || !entry.roleIds?.length || entry.roleIds.includes(roleId)) add(entry);
  }

  return ordered.slice(0, 8);
}

function saveWorkflowDocumentIndex(projectCwd: string, index: WorkflowDocumentIndex) {
  const filePath = path.join(getDocumentsRoot(projectCwd), INDEX_FILE);
  fs.writeFileSync(filePath, `${JSON.stringify(index, null, 2)}\n`, "utf8");
}

function loadTaskRegistry(projectCwd: string | undefined): TaskRegistry | undefined {
  const filePath = getTaskRegistryPath(projectCwd);
  if (!filePath || !fs.existsSync(filePath)) return undefined;
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as TaskRegistry;
    if (parsed?.version !== 1 || !Array.isArray(parsed.tasks)) return undefined;
    return parsed;
  } catch {
    return undefined;
  }
}

function saveTaskRegistry(projectCwd: string, registry: TaskRegistry) {
  fs.writeFileSync(getTaskRegistryPath(projectCwd)!, `${JSON.stringify(registry, null, 2)}\n`, "utf8");
}

function archiveSupersededCheckpointDocuments(index: WorkflowDocumentIndex, projectCwd: string, taskId: string | undefined, latestId: string) {
  const archiveRoot = path.join(getDocumentsRoot(projectCwd), ARCHIVE_DIR);
  fs.mkdirSync(archiveRoot, { recursive: true });

  for (const entry of index.documents) {
    if (entry.kind !== "checkpoint" || entry.status !== "active" || entry.id === latestId) continue;
    if (taskId && entry.taskId !== taskId) continue;

    const nextPath = path.join(archiveRoot, path.basename(entry.path));
    if (fs.existsSync(entry.path) && entry.path !== nextPath) {
      fs.renameSync(entry.path, nextPath);
      entry.path = nextPath;
    }
    entry.status = "archived";
    entry.updatedAt = new Date().toISOString();
  }
}

function inferLatestLegacyCheckpoint(projectCwd: string) {
  const lines = readProjectLogTail(projectCwd, 200).reverse();
  for (const line of lines) {
    const parsed = parseLegacyWorkflowLine(line);
    if (parsed) return parsed;
  }
  return undefined;
}

function parseLegacyWorkflowLine(line: string):
  | { timestamp: string; roleId: string; status: CheckpointEntry["status"]; taskId?: string; nextRoleId?: string; summary: string; evidence?: string[] }
  | undefined {
  const timestamp = line.match(/^\-\s+\[([^\]]+)\]/)?.[1];
  if (!timestamp) return undefined;

  if (line.includes("[checkpoint]")) {
    return {
      timestamp,
      roleId: line.match(/\brole=([a-z0-9-]+)/i)?.[1]?.toLowerCase() ?? "orchestrator",
      status: (line.match(/\bstatus=([a-z_]+)/i)?.[1] as CheckpointEntry["status"] | undefined) ?? "done",
      taskId: line.match(/\btask=([^\s|]+)/i)?.[1],
      nextRoleId: line.match(/\bnext=([a-z0-9-]+)/i)?.[1]?.toLowerCase(),
      summary: line.split("|").slice(1).join("|").trim() || "Recovered checkpoint",
      evidence: extractEvidence(line),
    };
  }

  if (line.includes("[handoff]")) {
    return {
      timestamp,
      roleId: line.match(/\]\s*\[handoff\]\s*([a-z0-9-]+)/i)?.[1]?.toLowerCase() ?? "orchestrator",
      status: "handoff",
      taskId: line.match(/\btask=([^\s|]+)/i)?.[1],
      nextRoleId: line.match(/\]\s*\[handoff\]\s*[a-z0-9-]+\s*->\s*([a-z0-9-]+)/i)?.[1]?.toLowerCase(),
      summary: line.split("|").slice(1, 2).join("|").trim() || "Recovered handoff",
      evidence: extractDeliverables(line),
    };
  }

  if (line.includes("[blocker]")) {
    return {
      timestamp,
      roleId: line.match(/\brole=([a-z0-9-]+)/i)?.[1]?.toLowerCase() ?? "orchestrator",
      status: "blocked",
      taskId: line.match(/\btask=([^\s|]+)/i)?.[1],
      summary: line.split("|").slice(1, 2).join("|").trim() || "Recovered blocker",
    };
  }

  return undefined;
}

function extractDeliverables(line: string): string[] | undefined {
  const chunk = line.match(/\|\s*deliverables:\s*(.+?)(?:\s*\|\s*blockers:|$)/i)?.[1];
  return chunk ? chunk.split(";").map((part) => part.trim()).filter(Boolean) : undefined;
}

function extractEvidence(line: string): string[] | undefined {
  const chunk = line.match(/\|\s*evidence:\s*(.+)$/i)?.[1];
  return chunk ? chunk.split(";").map((part) => part.trim()).filter(Boolean) : undefined;
}

function seedProjectBriefFromExistingDocs(project: ProjectState): string | undefined {
  if (!project.cwd) return undefined;
  const candidates = [
    path.join(project.cwd, "docs", "project-overview.md"),
    path.join(project.cwd, "docs", "ai-brief.md"),
    path.join(project.cwd, "docs", "scout-brief.md"),
  ];

  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) continue;
    const content = fs.readFileSync(candidate, "utf8");
    const summary = extractFirstUsefulParagraph(content);
    if (!summary) continue;
    return writeProjectBrief(project, summary, {
      currentState: [`- Seeded from ${path.relative(project.cwd, candidate)}`],
      roleId: "migration",
    });
  }
  return undefined;
}

function extractFirstUsefulParagraph(content: string): string | undefined {
  const paragraphs = content
    .split(/\r?\n\r?\n/)
    .map((part) => part.replace(/^#+\s*/gm, "").trim())
    .filter((part) => part && !part.startsWith("-") && part.length > 40);
  return paragraphs[0]?.slice(0, 600);
}

function upsertDocument(index: WorkflowDocumentIndex, incoming: ProjectDocumentEntry) {
  const existing = index.documents.find((entry) => entry.id === incoming.id);
  if (existing) {
    existing.title = incoming.title;
    existing.path = incoming.path;
    existing.kind = incoming.kind;
    existing.status = incoming.status;
    existing.roleIds = incoming.roleIds;
    existing.taskId = incoming.taskId;
    existing.summary = incoming.summary;
    existing.tags = incoming.tags;
    existing.supersedes = incoming.supersedes;
    existing.updatedAt = incoming.updatedAt;
    if (!existing.createdAt) existing.createdAt = incoming.createdAt;
    return;
  }
  index.documents.push(incoming);
}

function findDocument(index: WorkflowDocumentIndex, id: string): ProjectDocumentEntry | undefined {
  return index.documents.find((entry) => entry.id === id);
}

function getDocumentsRoot(projectCwd: string) {
  return path.join(projectCwd, DOCUMENTS_DIR);
}

function fileUpdatedAt(filePath: string, fallback: string) {
  try {
    return fs.statSync(filePath).mtime.toISOString();
  } catch {
    return fallback;
  }
}

function compactRoleIds(values: Array<string | undefined>): string[] | undefined {
  const compact = Array.from(new Set(values.filter(Boolean) as string[]));
  return compact.length ? compact : undefined;
}

function compactStrings(values: Array<string | undefined>): string[] | undefined {
  const compact = Array.from(new Set(values.filter(Boolean) as string[]));
  return compact.length ? compact : undefined;
}

function formatWorkflowRole(slot: WorkflowSnapshot["current"]) {
  if (!slot?.roleId) return "- none";
  return `- ${slot.roleId} | ${slot.status ?? "idle"}${slot.taskId ? ` | task: ${slot.taskId}` : ""}${slot.summary ? ` | ${slot.summary}` : ""}`;
}

function normalizeTaskStatus(status: string | undefined): TaskState["status"] {
  switch (status) {
    case "planning":
    case "reading":
    case "queued":
      return "planned";
    case "working":
      return "working";
    case "reviewing":
      return "review";
    case "blocked":
      return "blocked";
    case "done":
    case "handoff":
      return "done";
    default:
      return "planned";
  }
}

function isPlaceholderBrief(filePath: string): boolean {
  if (!fs.existsSync(filePath)) return true;
  const content = fs.readFileSync(filePath, "utf8");
  return content.includes(BRIEF_PLACEHOLDER);
}
