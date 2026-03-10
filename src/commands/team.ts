import type { ExtensionAPI, ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import type { OrchestratorState, TeamConfig } from "../state/types";
import { renderStatusPanel } from "../ui/status-panel";

interface TeamCommandDeps {
  getState: () => OrchestratorState;
  getTeams: () => TeamConfig[];
  setActiveTeamById: (teamId: string) => void;
  persistState: () => void;
  updateIndicator: (ctx: ExtensionCommandContext) => void;
}

export function registerTeamCommands(pi: ExtensionAPI, deps: TeamCommandDeps) {
  pi.registerCommand("team-list", {
    description: "List available teams",
    handler: async (_args, ctx) => {
      const teams = deps.getTeams();
      if (!teams.length) {
        printOutput(ctx, "No teams loaded. Check teams/<team>/roles/*.md files.");
        return;
      }

      const state = deps.getState();
      const active = state.activeTeamId;
      const text = teams
        .map((team) => {
          const marker = team.id === active ? "*" : "-";
          return `${marker} ${team.id} (${team.roles.length} roles, phases: ${team.phases.join(", ")})`;
        })
        .join("\n");

      printOutput(ctx, text);
    },
  });

  pi.registerCommand("team-load", {
    description: "Load a team by id",
    handler: async (args, ctx) => {
      const requested = args.trim().toLowerCase();
      if (!requested) {
        printOutput(ctx, "Usage: /team-load <team-id>");
        return;
      }

      const team = resolveTeam(deps.getTeams(), requested);
      if (!team) {
        printOutput(ctx, `Unknown team: ${requested}`);
        return;
      }

      deps.setActiveTeamById(team.id);
      deps.persistState();
      deps.updateIndicator(ctx);

      printOutput(ctx, `Loaded team: ${team.id}`);
    },
  });

  pi.registerCommand("team-status", {
    description: "Show current team/project status",
    handler: async (_args, ctx) => {
      const state = deps.getState();
      const team = state.activeTeamId ? resolveTeam(deps.getTeams(), state.activeTeamId) : undefined;
      printOutput(ctx, renderStatusPanel(state, team));
    },
  });
}

function resolveTeam(teams: TeamConfig[], teamId: string): TeamConfig | undefined {
  const normalized = normalizeTeamRef(teamId);
  return teams.find((team) => normalizeTeamRef(team.id) === normalized);
}

function normalizeTeamRef(value: string): string {
  if (value === "wep-app") return "web-app";
  return value.trim().toLowerCase();
}

function printOutput(ctx: ExtensionCommandContext, text: string) {
  if (ctx.hasUI) {
    ctx.ui.setEditorText(text);
    return;
  }
  console.log(text);
}
