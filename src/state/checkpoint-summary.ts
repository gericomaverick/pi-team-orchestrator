import type { CheckpointEntry, ProjectState } from "./types";

const ACTIVE_ROLE_STATES = new Set(["reading", "planning", "working", "reviewing", "blocked"]);

export function inferCurrentRoleId(project: ProjectState): string | undefined {
  if (project.currentTask?.assignedRoleId) return project.currentTask.assignedRoleId;

  return Object.values(project.roleStatuses).find((status) => ACTIVE_ROLE_STATES.has(status.state))?.roleId;
}

export function buildCheckpointSummary(
  project: ProjectState,
  input: {
    roleId: string;
    status: CheckpointEntry["status"];
    taskId?: string;
    nextRoleId?: string;
    summaryHint?: string;
  },
): string {
  const hinted = input.summaryHint?.trim();
  if (hinted) return hinted;

  const taskLabel = resolveTaskLabel(project, input.taskId);
  const latestBlocker = project.blockers.at(-1)?.summary;

  switch (input.status) {
    case "handoff":
      return `${taskLabel} ready for ${input.nextRoleId ?? "next role"}`;
    case "blocked":
      return latestBlocker ? `${taskLabel} blocked: ${latestBlocker}` : `${taskLabel} is blocked`;
    case "in_progress":
      return `${taskLabel} in progress`;
    case "done":
    default:
      return input.nextRoleId ? `${taskLabel} completed; next ${input.nextRoleId}` : `${taskLabel} completed`;
  }
}

function resolveTaskLabel(project: ProjectState, taskId?: string): string {
  if (project.currentTask?.title) {
    return `Task '${project.currentTask.title}'`;
  }

  if (taskId) {
    return `Task ${taskId}`;
  }

  return "Current scope";
}
