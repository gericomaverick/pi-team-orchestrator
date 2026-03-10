import type { OrchestratorState, TeamConfig } from "../state/types";

export function renderCompactStatus(
  state: OrchestratorState,
  activeTeam?: TeamConfig,
): string {
  const project = state.activeProjectId ? state.projects[state.activeProjectId] : undefined;
  const role = project?.currentTask?.assignedRoleId ?? inferCurrentRole(project);
  const task = project?.currentTask?.title ?? "none";
  const phase = project?.currentPhase ?? activeTeam?.defaultPhase ?? "none";
  const blockers = project?.blockers.length ?? 0;
  const handoffs = project?.handoffs.length ?? 0;
  const roleState = role && project?.roleStatuses[role] ? project.roleStatuses[role].state : "idle";

  return [
    `[${activeTeam?.id ?? "no-team"}]`,
    `[project: ${project?.name ?? "none"}]`,
    `[phase: ${phase}]`,
    `[role: ${role ?? "none"}]`,
    `[state: ${roleState}]`,
    `[task: ${task}]`,
    `[handoffs: ${handoffs}]`,
    `[blockers: ${blockers}]`,
  ].join(" ");
}

function inferCurrentRole(project?: OrchestratorState["projects"][string]): string | undefined {
  if (!project) return undefined;
  const working = Object.values(project.roleStatuses).find((status) =>
    ["reading", "planning", "working", "reviewing", "blocked"].includes(status.state),
  );
  return working?.roleId;
}
