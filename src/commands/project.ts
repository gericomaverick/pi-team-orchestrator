import type { ExtensionAPI, ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { bindTeamToProject, ensureProject, ensureRoleStatusesForTeam, setActiveProject, setActiveTeam } from "../state/store";
import { listProjectCandidates, resolveProjectPath } from "../state/project-registry";
import type { OrchestratorState, TeamConfig } from "../state/types";

interface ProjectCommandDeps {
  getState: () => OrchestratorState;
  getTeams: () => TeamConfig[];
  persistState: () => void;
  updateIndicator: (ctx: ExtensionCommandContext) => void;
}

export function registerProjectCommands(pi: ExtensionAPI, deps: ProjectCommandDeps) {
  pi.registerCommand("project-list", {
    description: "List available projects",
    handler: async (_args, ctx) => {
      const state = deps.getState();
      const diskProjects = listProjectCandidates();
      const knownIds = new Set(diskProjects.map((project) => project.id));

      for (const projectId of Object.keys(state.projects)) {
        if (knownIds.has(projectId)) continue;
        const project = state.projects[projectId];
        diskProjects.push({
          id: project.id,
          name: project.name,
          cwd: project.cwd ?? resolveProjectPath(project.id),
        });
      }

      if (!diskProjects.length) {
        printOutput(ctx, "No projects found under ~/.pi/projects");
        return;
      }

      const text = diskProjects
        .sort((a, b) => a.id.localeCompare(b.id))
        .map((project) => {
          const stateProject = state.projects[project.id];
          const active = state.activeProjectId === project.id ? "*" : "-";
          const team = stateProject?.boundTeamId ?? "none";
          return `${active} ${project.id} (team: ${team})`;
        })
        .join("\n");

      printOutput(ctx, text);
    },
  });

  pi.registerCommand("project-switch", {
    description: "Switch active project",
    handler: async (args, ctx) => {
      const projectId = args.trim();
      if (!projectId) {
        printOutput(ctx, "Usage: /project-switch <project-id>");
        return;
      }

      const state = deps.getState();
      const cwd = resolveProjectPath(projectId);
      const project = ensureProject(state, projectId, projectId, cwd);
      setActiveProject(state, projectId);

      if (project.boundTeamId) {
        setActiveTeam(state, project.boundTeamId);
        const boundTeam = deps.getTeams().find((team) => team.id === project.boundTeamId);
        if (boundTeam) {
          project.currentPhase = project.currentPhase ?? boundTeam.defaultPhase;
          ensureRoleStatusesForTeam(project, boundTeam);
        }
      }

      deps.persistState();
      deps.updateIndicator(ctx);

      printOutput(
        ctx,
        [
          `Active project: ${projectId}`,
          `Bound team: ${project.boundTeamId ?? "none"}`,
          `Project path: ${project.cwd ?? "unknown"}`,
        ].join("\n"),
      );
    },
  });

  pi.registerCommand("project-bind-team", {
    description: "Bind active project to a team",
    handler: async (args, ctx) => {
      const requestedTeamId = args.trim().toLowerCase();
      if (!requestedTeamId) {
        printOutput(ctx, "Usage: /project-bind-team <team-id>");
        return;
      }

      const state = deps.getState();
      if (!state.activeProjectId) {
        printOutput(ctx, "No active project. Use /project-switch first.");
        return;
      }

      const team = resolveTeam(deps.getTeams(), requestedTeamId);
      if (!team) {
        printOutput(ctx, `Unknown team: ${requestedTeamId}`);
        return;
      }

      const project = ensureProject(state, state.activeProjectId);
      const previousTeamId = project.boundTeamId;

      bindTeamToProject(state, state.activeProjectId, team.id);
      setActiveTeam(state, team.id);

      project.currentPhase = project.currentPhase ?? team.defaultPhase;
      ensureRoleStatusesForTeam(project, team);

      deps.persistState();
      deps.updateIndicator(ctx);

      const reboundNote = previousTeamId && previousTeamId !== team.id ? ` (rebound from ${previousTeamId})` : "";
      printOutput(ctx, `Bound project ${state.activeProjectId} to team ${team.id}${reboundNote}`);
    },
  });

  pi.registerCommand("project-status", {
    description: "Show active project status",
    handler: async (_args, ctx) => {
      const state = deps.getState();
      const project = state.activeProjectId ? state.projects[state.activeProjectId] : undefined;
      if (!project) {
        printOutput(ctx, "No active project");
        return;
      }

      printOutput(
        ctx,
        [
          `Project: ${project.name}`,
          `Path: ${project.cwd ?? "unknown"}`,
          `Bound team: ${project.boundTeamId ?? "none"}`,
          `Milestone: ${project.milestone ?? "none"}`,
          `Phase: ${project.currentPhase ?? "none"}`,
          `Task: ${project.currentTask?.title ?? "none"}`,
          `Blockers: ${project.blockers.length}`,
          `Handoffs: ${project.handoffs.length}`,
        ].join("\n"),
      );
    },
  });
}

function resolveTeam(teams: TeamConfig[], requestedTeamId: string): TeamConfig | undefined {
  const normalized = requestedTeamId === "wep-app" ? "web-app" : requestedTeamId;
  return teams.find((team) => team.id === normalized);
}

function printOutput(ctx: ExtensionCommandContext, text: string) {
  if (ctx.hasUI) {
    ctx.ui.setEditorText(text);
    return;
  }
  console.log(text);
}
