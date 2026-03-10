import type { OrchestratorState, TeamConfig } from "../state/types";

export function renderStatusPanel(state: OrchestratorState, activeTeam?: TeamConfig): string {
  const project = state.activeProjectId ? state.projects[state.activeProjectId] : undefined;
  const currentRole =
    project?.currentTask?.assignedRoleId ??
    Object.values(project?.roleStatuses ?? {}).find((r) =>
      ["reading", "planning", "working", "reviewing", "blocked"].includes(r.state),
    )?.roleId;

  return [
    `Team: ${activeTeam?.id ?? "none"}`,
    `Project: ${project?.name ?? "none"}`,
    `Milestone: ${project?.milestone ?? "none"}`,
    `Phase: ${project?.currentPhase ?? activeTeam?.defaultPhase ?? "none"}`,
    `Current Role: ${currentRole ?? "none"}`,
    `Current Task: ${project?.currentTask?.title ?? "none"}`,
    `Open Blockers: ${project?.blockers.length ?? 0}`,
    `Handoffs: ${project?.handoffs.length ?? 0}`,
  ].join("\n");
}
