import { readLatestRoleHint } from "../state/project-log";
import type { OrchestratorState, TeamConfig } from "../state/types";

export function renderStatusPanel(state: OrchestratorState, activeTeam?: TeamConfig): string {
  const project = state.activeProjectId ? state.projects[state.activeProjectId] : undefined;
  const diskRoleHint = readLatestRoleHint(project?.cwd);
  const currentRole = project?.workflow?.current?.roleId ?? diskRoleHint.roleId;
  const currentRoleState = project?.workflow?.current?.status ?? diskRoleHint.status ?? "idle";

  return [
    `Team: ${activeTeam?.id ?? "none"}`,
    `Project: ${project?.name ?? "none"}`,
    `Milestone: ${project?.milestone ?? "none"}`,
    `Phase: ${project?.currentPhase ?? activeTeam?.defaultPhase ?? "none"}`,
    `Previous Role: ${project?.workflow?.previous?.roleId ?? "none"}`,
    `Current Role: ${currentRole ?? "none"}`,
    `Role State: ${currentRoleState}`,
    `Next Role: ${project?.workflow?.next?.roleId ?? "none"}`,
    `Current Task: ${project?.currentTask?.title ?? "none"}`,
    `Brief: ${project?.workflow?.briefPath ?? "none"}`,
    `Latest Checkpoint: ${project?.workflow?.latestCheckpointPath ?? "none"}`,
    `Open Blockers: ${project?.blockers.length ?? 0}`,
    `Handoffs: ${project?.handoffs.length ?? 0}`,
    `Checkpoints: ${project?.checkpoints.length ?? 0}`,
    `Messenger Mode: ${state.messengerMode === "allowed" ? "allowed" : "blocked"}`,
  ].join("\n");
}
