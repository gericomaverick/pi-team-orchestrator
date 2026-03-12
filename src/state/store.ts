import type { OrchestratorState, ProjectState, RoleState, TeamConfig } from "./types";

export const DEFAULT_STATE: OrchestratorState = {
  activeTeamId: undefined,
  activeProjectId: undefined,
  footerMode: "rich",
  messengerMode: "blocked",
  teamBoardMode: "on",
  projects: {},
};

export function ensureProject(state: OrchestratorState, projectId: string, name?: string, cwd?: string): ProjectState {
  if (!state.projects[projectId]) {
    state.projects[projectId] = {
      id: projectId,
      name: name ?? projectId,
      cwd,
      blockers: [],
      canonDocs: [],
      decisions: [],
      handoffs: [],
      checkpoints: [],
      tasks: {},
      roleStatuses: {},
      workflow: {},
    };
  }
  const project = state.projects[projectId];
  if (!Array.isArray(project.blockers)) project.blockers = [];
  if (!Array.isArray(project.canonDocs)) project.canonDocs = [];
  if (!Array.isArray(project.decisions)) project.decisions = [];
  if (!Array.isArray(project.handoffs)) project.handoffs = [];
  if (!Array.isArray(project.checkpoints)) project.checkpoints = [];
  if (!project.tasks || typeof project.tasks !== "object") project.tasks = {};
  if (!project.roleStatuses || typeof project.roleStatuses !== "object") project.roleStatuses = {};
  if (!project.workflow || typeof project.workflow !== "object") project.workflow = {};

  if (name) project.name = name;
  if (cwd) project.cwd = cwd;
  return project;
}

export function getActiveProject(state: OrchestratorState): ProjectState | undefined {
  if (!state.activeProjectId) return undefined;
  return state.projects[state.activeProjectId];
}

export function setActiveTeam(state: OrchestratorState, teamId: string | undefined) {
  state.activeTeamId = teamId;
}

export function setActiveProject(state: OrchestratorState, projectId: string) {
  state.activeProjectId = projectId;
}

export function bindTeamToProject(state: OrchestratorState, projectId: string, teamId: string) {
  const project = ensureProject(state, projectId);
  project.boundTeamId = teamId;
}

export function ensureRoleStatusesForTeam(project: ProjectState, team: TeamConfig) {
  for (const role of team.roles) {
    if (!project.roleStatuses[role.id]) {
      project.roleStatuses[role.id] = {
        roleId: role.id,
        state: "idle",
        updatedAt: new Date().toISOString(),
      };
    }
  }
}

export function setRoleState(
  state: OrchestratorState,
  projectId: string,
  roleId: string,
  roleState: RoleState,
  summary?: string,
  taskId?: string,
) {
  const project = ensureProject(state, projectId);
  project.roleStatuses[roleId] = {
    roleId,
    state: roleState,
    summary,
    taskId,
    updatedAt: new Date().toISOString(),
  };
}

export function teamSummary(team: TeamConfig | undefined, state: OrchestratorState): string {
  return [`Team: ${team?.id ?? "none"}`, `Project: ${state.activeProjectId ?? "none"}`].join(" | ");
}
