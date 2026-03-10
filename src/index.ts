import fs from "node:fs";
import path from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { registerProjectCommands } from "./commands/project";
import { registerTeamCommands } from "./commands/team";
import { registerWorkflowCommands } from "./commands/workflow";
import { restoreOrchestratorState, persistOrchestratorState } from "./state/persistence";
import { DEFAULT_STATE, ensureRoleStatusesForTeam, setActiveTeam } from "./state/store";
import { loadTeamsFromMarkdown } from "./state/team-loader";
import type { OrchestratorState, TeamConfig } from "./state/types";
import { registerHandoffTool } from "./tools/handoff";
import { registerRoleStatusTool } from "./tools/role-status";
import { updateStatusIndicator } from "./ui/status-indicator";

let state: OrchestratorState = cloneState(DEFAULT_STATE);
let teams: TeamConfig[] = [];

function cloneState<T>(value: T): T {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function normalizeTeamId(input: string): string {
  return input === "wep-app" ? "web-app" : input;
}

function resolveTeamsRoot(): string {
  const thisDir = typeof __dirname === "string" ? __dirname : process.cwd();
  const candidates = [path.resolve(process.cwd(), "teams"), path.resolve(thisDir, "..", "teams")];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return candidates[0]!;
}

function loadTeams(ctx?: ExtensionContext) {
  const result = loadTeamsFromMarkdown(resolveTeamsRoot());
  teams = result.teams;

  if (ctx?.hasUI) {
    for (const warning of result.warnings) {
      ctx.ui.notify(`[team-loader] ${warning}`, "warning");
    }
    if (!teams.length) {
      ctx.ui.notify("No teams loaded from markdown files.", "warning");
    }
  }

  syncStateWithLoadedTeams();
}

function syncStateWithLoadedTeams() {
  if (state.activeTeamId) {
    const normalized = normalizeTeamId(state.activeTeamId);
    if (normalized !== state.activeTeamId) state.activeTeamId = normalized;
    if (!teams.some((team) => team.id === state.activeTeamId)) {
      state.activeTeamId = undefined;
    }
  }

  if (!state.activeProjectId) return;
  const project = state.projects[state.activeProjectId];
  if (!project) return;

  if (project.boundTeamId) {
    project.boundTeamId = normalizeTeamId(project.boundTeamId);
    const team = teams.find((candidate) => candidate.id === project.boundTeamId);
    if (team) {
      state.activeTeamId = team.id;
      project.currentPhase = project.currentPhase ?? team.defaultPhase;
      ensureRoleStatusesForTeam(project, team);
    }
  }
}

function persistState(pi: ExtensionAPI) {
  persistOrchestratorState(pi, state);
}

function refreshIndicator(ctx: ExtensionContext) {
  updateStatusIndicator(ctx, state, teams);
}

function restoreStateFromSession(ctx: ExtensionContext) {
  const restored = restoreOrchestratorState(ctx);
  if (restored) state = restored;
  syncStateWithLoadedTeams();
}

export default function register(pi: ExtensionAPI) {
  const getState = () => state;
  const getTeams = () => teams;

  const setActiveTeamById = (teamId: string) => {
    const normalized = normalizeTeamId(teamId.trim().toLowerCase());
    const matched = teams.find((team) => team.id === normalized);
    if (!matched) return;
    setActiveTeam(state, matched.id);

    if (state.activeProjectId) {
      const project = state.projects[state.activeProjectId];
      if (project && project.boundTeamId === matched.id) {
        project.currentPhase = project.currentPhase ?? matched.defaultPhase;
        ensureRoleStatusesForTeam(project, matched);
      }
    }
  };

  const persist = () => persistState(pi);

  registerTeamCommands(pi, {
    getState,
    getTeams,
    setActiveTeamById,
    persistState: persist,
    updateIndicator: refreshIndicator,
  });

  registerProjectCommands(pi, {
    getState,
    getTeams,
    persistState: persist,
    updateIndicator: refreshIndicator,
  });

  registerWorkflowCommands(pi, { getState });

  registerHandoffTool(pi, getState, persist, refreshIndicator);
  registerRoleStatusTool(pi, getState, persist, refreshIndicator);

  pi.on("session_start", async (_event, ctx) => {
    loadTeams(ctx);
    restoreStateFromSession(ctx);
    refreshIndicator(ctx);
  });

  pi.on("session_switch", async (_event, ctx) => {
    loadTeams(ctx);
    restoreStateFromSession(ctx);
    refreshIndicator(ctx);
  });

  pi.on("session_tree", async (_event, ctx) => {
    restoreStateFromSession(ctx);
    refreshIndicator(ctx);
  });

  pi.on("session_fork", async (_event, ctx) => {
    restoreStateFromSession(ctx);
    refreshIndicator(ctx);
  });

  pi.on("turn_start", async (_event, ctx) => {
    refreshIndicator(ctx);
  });
}
