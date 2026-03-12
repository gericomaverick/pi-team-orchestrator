import type { ExtensionAPI, ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { bindTeamToProject, ensureProject, ensureRoleStatusesForTeam, setActiveProject, setActiveTeam } from "../state/store";
import { ensureProjectDirectory, listProjectCandidates, resolveProjectPath, validateProjectId } from "../state/project-registry";
import { ensureProjectWorkflowFiles, hydrateProjectFromFiles, migrateProjectWorkflow, writeProjectBrief } from "../state/workflow-files";
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
      const projects = listKnownProjects(state);

      if (!projects.length) {
        printOutput(ctx, "No projects found under ~/.pi/projects");
        return;
      }

      const text = projects
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

  pi.registerCommand("project-init", {
    description: "Initialize a project directory under ~/.pi/projects and switch to it",
    handler: async (args, ctx) => {
      const parsed = parseProjectInitArgs(args);
      let projectId = parsed.projectId;

      if (!projectId && ctx.hasUI) {
        const value = await ctx.ui.input("Initialize project", "project-id");
        if (!value) {
          printOutput(ctx, "Project init cancelled.");
          return;
        }
        projectId = value.trim();
      }

      if (!projectId) {
        printOutput(ctx, "Usage: /project-init <project-id> [--bind-active-team]");
        return;
      }

      const validationError = validateProjectId(projectId);
      if (validationError) {
        printOutput(ctx, `Invalid project id '${projectId}': ${validationError}`);
        return;
      }

      const state = deps.getState();
      const teams = deps.getTeams();
      const { cwd, created } = ensureProjectDirectory(projectId);
      const project = ensureProject(state, projectId, projectId, cwd);
      ensureProjectWorkflowFiles(project);
      setActiveProject(state, projectId);

      if (parsed.bindActiveTeam) {
        const activeTeam = state.activeTeamId ? resolveTeam(teams, state.activeTeamId) : undefined;
        if (activeTeam) {
          bindTeamToProject(state, projectId, activeTeam.id);
          setActiveTeam(state, activeTeam.id);
          project.currentPhase = project.currentPhase ?? activeTeam.defaultPhase;
          ensureRoleStatusesForTeam(project, activeTeam);
          hydrateProjectFromFiles(project);
        }
      }

      if (project.boundTeamId) {
        setActiveTeam(state, project.boundTeamId);
        const boundTeam = teams.find((team) => team.id === project.boundTeamId);
        if (boundTeam) {
          project.currentPhase = project.currentPhase ?? boundTeam.defaultPhase;
          ensureRoleStatusesForTeam(project, boundTeam);
        }
      }
      hydrateProjectFromFiles(project);

      deps.persistState();
      deps.updateIndicator(ctx);

      const action = created ? "Created" : "Using existing";
      const bindNote = parsed.bindActiveTeam
        ? project.boundTeamId
          ? `Bound active team: ${project.boundTeamId}`
          : "Requested active-team bind, but no active team was set"
        : `Bound team: ${project.boundTeamId ?? "none"}`;

      printOutput(
        ctx,
        [
          `${action} project: ${projectId}`,
          `Project path: ${cwd}`,
          bindNote,
        ].join("\n"),
      );
    },
  });

  pi.registerCommand("project-switch", {
    description: "Switch active project",
    getArgumentCompletions: (prefix) => {
      const normalized = prefix.trim().toLowerCase();
      const state = deps.getState();
      const items = listKnownProjects(state)
        .sort((a, b) => a.id.localeCompare(b.id))
        .map((project) => {
          const team = state.projects[project.id]?.boundTeamId ?? "none";
          return {
            value: project.id,
            label: `${project.id} (team: ${team})`,
          };
        })
        .filter((item) => !normalized || item.value.startsWith(normalized));

      return items.length ? items : null;
    },
    handler: async (args, ctx) => {
      const state = deps.getState();
      const projects = listKnownProjects(state);

      let projectId = args.trim();
      if (!projectId) {
        if (!ctx.hasUI) {
          printOutput(ctx, "Usage: /project-switch <project-id>");
          return;
        }

        if (!projects.length) {
          printOutput(ctx, "No projects found under ~/.pi/projects");
          return;
        }

        const options = projects
          .slice()
          .sort((a, b) => a.id.localeCompare(b.id))
          .map((project) => {
            const team = state.projects[project.id]?.boundTeamId ?? "none";
            return `${project.id} (team: ${team})`;
          });

        const selected = await ctx.ui.select("Switch project", options);
        if (!selected) {
          printOutput(ctx, "Project switch cancelled.");
          return;
        }
        projectId = extractIdPrefix(selected);
      }

      const project = activateProject(state, projectId, deps.getTeams());

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
    getArgumentCompletions: (prefix) => {
      const normalized = prefix.trim().toLowerCase();
      const items = deps
        .getTeams()
        .map((team) => ({
          value: team.id,
          label: `${team.id} (${team.roles.length} roles)`,
        }))
        .filter((item) => !normalized || item.value.startsWith(normalized));

      return items.length ? items : null;
    },
    handler: async (args, ctx) => {
      const state = deps.getState();
      if (!state.activeProjectId) {
        printOutput(ctx, "No active project. Use /project-switch first.");
        return;
      }

      const teams = deps.getTeams();
      if (!teams.length) {
        printOutput(ctx, "No teams loaded. Check teams/<team>/team.json or teams/<team>/roles/*.md.");
        return;
      }

      let requestedTeamId = args.trim().toLowerCase();
      if (!requestedTeamId) {
        if (!ctx.hasUI) {
          printOutput(ctx, "Usage: /project-bind-team <team-id>");
          return;
        }

        const options = teams
          .slice()
          .sort((a, b) => a.id.localeCompare(b.id))
          .map((team) => `${team.id} (${team.roles.length} roles)`);

        const selected = await ctx.ui.select("Bind active project to team", options);
        if (!selected) {
          printOutput(ctx, "Project/team bind cancelled.");
          return;
        }
        requestedTeamId = extractIdPrefix(selected).toLowerCase();
      }

      const team = resolveTeam(teams, requestedTeamId);
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
      hydrateProjectFromFiles(project);

      deps.persistState();
      deps.updateIndicator(ctx);

      const reboundNote = previousTeamId && previousTeamId !== team.id ? ` (rebound from ${previousTeamId})` : "";
      printOutput(ctx, `Bound project ${state.activeProjectId} to team ${team.id}${reboundNote}`);
    },
  });

  pi.registerCommand("project-brief", {
    description: "Write or inspect the concise project brief file",
    handler: async (args, ctx) => {
      const state = deps.getState();
      const project = state.activeProjectId ? state.projects[state.activeProjectId] : undefined;
      if (!project) {
        printOutput(ctx, "No active project");
        return;
      }

      hydrateProjectFromFiles(project);

      const summary = args.trim();
      if (!summary) {
        printOutput(ctx, `Project brief: ${project.workflow?.briefPath ?? "not initialized"}`);
        return;
      }

      const briefPath = writeProjectBrief(project, summary, {
        roleId: project.workflow?.current?.roleId ?? project.workflow?.next?.roleId,
      });

      deps.persistState();
      deps.updateIndicator(ctx);
      printOutput(ctx, `Updated project brief: ${briefPath ?? "unknown path"}`);
    },
  });

  pi.registerCommand("project-migrate", {
    description: "Initialize or reseed the file-backed workflow docs for the active project",
    handler: async (_args, ctx) => {
      const state = deps.getState();
      const project = state.activeProjectId ? state.projects[state.activeProjectId] : undefined;
      if (!project) {
        printOutput(ctx, "No active project");
        return;
      }

      hydrateProjectFromFiles(project);
      const team = deps.getTeams().find((candidate) => candidate.id === project.boundTeamId);
      const result = migrateProjectWorkflow(project, team);

      deps.persistState();
      deps.updateIndicator(ctx);

      const lines = [
        result.summary,
        `Brief: ${result.briefPath ?? project.workflow?.briefPath ?? "none"}`,
        `Task registry: ${result.taskRegistryPath ?? project.workflow?.taskRegistryPath ?? "none"}`,
        `Checkpoint: ${result.checkpointPath ?? project.workflow?.latestCheckpointPath ?? "none"}`,
        ...(result.warnings.length ? ["Warnings:", ...result.warnings.map((item) => `- ${item}`)] : []),
      ];
      printOutput(ctx, lines.join("\n"));
    },
  });

  pi.registerCommand("project-status", {
    description: "Show active project status",
    getArgumentCompletions: (prefix) => {
      const normalized = prefix.trim().toLowerCase();
      const state = deps.getState();
      const items = listKnownProjects(state)
        .sort((a, b) => a.id.localeCompare(b.id))
        .map((project) => ({
          value: project.id,
          label: project.id,
        }))
        .filter((item) => !normalized || item.value.startsWith(normalized));

      return items.length ? items : null;
    },
    handler: async (args, ctx) => {
      const state = deps.getState();
      const projects = listKnownProjects(state);
      let projectId = args.trim();

      if (!projectId && !state.activeProjectId && ctx.hasUI && projects.length) {
        const options = projects
          .slice()
          .sort((a, b) => a.id.localeCompare(b.id))
          .map((project) => project.id);
        const selected = await ctx.ui.select("Select project for status", options);
        if (!selected) {
          printOutput(ctx, "Project status cancelled.");
          return;
        }
        projectId = extractIdPrefix(selected);
      }

      if (projectId) {
        activateProject(state, projectId, deps.getTeams());
        deps.persistState();
        deps.updateIndicator(ctx);
      }

      const nextState = deps.getState();
      const project = nextState.activeProjectId ? nextState.projects[nextState.activeProjectId] : undefined;
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
          `Brief: ${project.workflow?.briefPath ?? "none"}`,
          `Latest checkpoint: ${project.workflow?.latestCheckpointPath ?? "none"}`,
          `Blockers: ${project.blockers.length}`,
          `Handoffs: ${project.handoffs.length}`,
          `Checkpoints: ${project.checkpoints.length}`,
        ].join("\n"),
      );
    },
  });
}

function parseProjectInitArgs(rawArgs: string): { projectId: string; bindActiveTeam: boolean } {
  const tokens = rawArgs
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);

  let bindActiveTeam = false;
  const positional: string[] = [];

  for (const token of tokens) {
    if (token === "--bind-active-team") {
      bindActiveTeam = true;
      continue;
    }
    positional.push(token);
  }

  return {
    projectId: positional[0] ?? "",
    bindActiveTeam,
  };
}

function resolveTeam(teams: TeamConfig[], requestedTeamId: string): TeamConfig | undefined {
  const normalized = requestedTeamId === "wep-app" ? "web-app" : requestedTeamId;
  return teams.find((team) => team.id === normalized);
}

function listKnownProjects(state: OrchestratorState): Array<{ id: string; name: string; cwd: string }> {
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

  return diskProjects;
}

function activateProject(state: OrchestratorState, projectId: string, teams: TeamConfig[]) {
  const cwd = resolveProjectPath(projectId);
  const project = ensureProject(state, projectId, projectId, cwd);
  ensureProjectWorkflowFiles(project);
  setActiveProject(state, projectId);

  if (project.boundTeamId) {
    setActiveTeam(state, project.boundTeamId);
    const boundTeam = teams.find((team) => team.id === project.boundTeamId);
    if (boundTeam) {
      project.currentPhase = project.currentPhase ?? boundTeam.defaultPhase;
      ensureRoleStatusesForTeam(project, boundTeam);
    }
  }

  hydrateProjectFromFiles(project);

  return project;
}

function extractIdPrefix(value: string): string {
  return value.trim().match(/^\S+/)?.[0] ?? value.trim();
}

function printOutput(ctx: ExtensionCommandContext, text: string) {
  if (ctx.hasUI) {
    const lines = text.split(/\r?\n/);
    const head = lines[0] ?? text;
    if (head) ctx.ui.notify(head, "info");

    const maxLines = 20;
    const widgetLines = lines.length > maxLines ? [...lines.slice(0, maxLines), `... (${lines.length - maxLines} more)`] : lines;
    ctx.ui.setWidget("team-orchestrator:last-output", widgetLines, { placement: "belowEditor" });
    return;
  }
  console.log(text);
}
