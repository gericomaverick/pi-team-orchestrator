import { readLatestRoleHint } from "../state/project-log";
import type { OrchestratorState, TeamConfig } from "../state/types";

export function renderStatusPanel(state: OrchestratorState, activeTeam?: TeamConfig): string {
  const project = state.activeProjectId ? state.projects[state.activeProjectId] : undefined;
  const diskRoleHint = readLatestRoleHint(project?.cwd);
  const inMemoryRole =
    project?.currentTask?.assignedRoleId ??
    Object.values(project?.roleStatuses ?? {}).find((r) =>
      ["reading", "planning", "working", "reviewing", "blocked"].includes(r.state),
    )?.roleId;

  const currentRole = inMemoryRole ?? diskRoleHint.roleId;

  const currentRoleState =
    inMemoryRole && currentRole && project?.roleStatuses?.[currentRole]
      ? project.roleStatuses[currentRole].state
      : diskRoleHint.status ?? "idle";

  return [
    `Team: ${activeTeam?.id ?? "none"}`,
    `Project: ${project?.name ?? "none"}`,
    `Milestone: ${project?.milestone ?? "none"}`,
    `Phase: ${project?.currentPhase ?? activeTeam?.defaultPhase ?? "none"}`,
    `Current Role: ${currentRole ?? "none"}`,
    `Role State: ${currentRoleState}`,
    `Current Task: ${project?.currentTask?.title ?? "none"}`,
    `Open Blockers: ${project?.blockers.length ?? 0}`,
    `Handoffs: ${project?.handoffs.length ?? 0}`,
    `Checkpoints: ${project?.checkpoints.length ?? 0}`,
    `Messenger Mode: ${state.messengerMode === "allowed" ? "allowed" : "blocked"}`,
  ].join("\n");
}
