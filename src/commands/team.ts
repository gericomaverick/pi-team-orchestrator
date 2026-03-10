import type { ExtensionAPI, ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import type { FooterMode, MessengerMode, OrchestratorState, TeamBoardMode, TeamConfig } from "../state/types";
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
      const teams = deps.getTeams();
      if (!teams.length) {
        printOutput(ctx, "No teams loaded. Check teams/<team>/roles/*.md files.");
        return;
      }

      let requested = args.trim().toLowerCase();
      if (!requested) {
        if (!ctx.hasUI) {
          printOutput(ctx, "Usage: /team-load <team-id>");
          return;
        }

        const options = teams
          .slice()
          .sort((a, b) => a.id.localeCompare(b.id))
          .map((team) => `${team.id} (${team.roles.length} roles)`);
        const selected = await ctx.ui.select("Load team", options);
        if (!selected) {
          printOutput(ctx, "Team load cancelled.");
          return;
        }
        requested = selected.split(" ")[0] ?? "";
      }

      const team = resolveTeam(teams, requested);
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

  pi.registerCommand("footer-mode", {
    description: "Set footer status mode (rich or compact)",
    getArgumentCompletions: (prefix) => {
      const normalized = prefix.trim().toLowerCase();
      const items = (["rich", "compact"] as const)
        .map((mode) => ({ value: mode, label: mode }))
        .filter((item) => !normalized || item.value.startsWith(normalized));
      return items.length ? items : null;
    },
    handler: async (args, ctx) => {
      const requested = args.trim().toLowerCase();
      const state = deps.getState();

      if (!requested) {
        const current = state.footerMode === "compact" ? "compact" : "rich";
        printOutput(ctx, `Footer mode: ${current}`);
        return;
      }

      if (requested !== "rich" && requested !== "compact") {
        printOutput(ctx, `Unknown footer mode: ${requested}. Use 'rich' or 'compact'.`);
        return;
      }

      state.footerMode = requested as FooterMode;
      deps.persistState();
      deps.updateIndicator(ctx);
      printOutput(ctx, `Footer mode set to ${requested}`);
    },
  });

  pi.registerCommand("team-board", {
    description: "Toggle team activity board widget (on/off)",
    getArgumentCompletions: (prefix) => {
      const normalized = prefix.trim().toLowerCase();
      const items = (["on", "off"] as const)
        .map((mode) => ({ value: mode, label: mode }))
        .filter((item) => !normalized || item.value.startsWith(normalized));
      return items.length ? items : null;
    },
    handler: async (args, ctx) => {
      const requested = args.trim().toLowerCase();
      const state = deps.getState();

      if (!requested) {
        const current = state.teamBoardMode === "off" ? "off" : "on";
        printOutput(ctx, `Team board: ${current}`);
        return;
      }

      if (requested !== "on" && requested !== "off") {
        printOutput(ctx, `Unknown team board mode: ${requested}. Use 'on' or 'off'.`);
        return;
      }

      state.teamBoardMode = requested as TeamBoardMode;
      deps.persistState();
      deps.updateIndicator(ctx);
      printOutput(ctx, `Team board set to ${requested}`);
    },
  });

  pi.registerCommand("messenger-mode", {
    description: "Set Pi Messenger policy for orchestration (blocked or allowed)",
    getArgumentCompletions: (prefix) => {
      const normalized = prefix.trim().toLowerCase();
      const items = (["blocked", "allowed"] as const)
        .map((mode) => ({ value: mode, label: mode }))
        .filter((item) => !normalized || item.value.startsWith(normalized));
      return items.length ? items : null;
    },
    handler: async (args, ctx) => {
      const requested = args.trim().toLowerCase();
      const state = deps.getState();

      if (!requested) {
        const current = state.messengerMode === "allowed" ? "allowed" : "blocked";
        printOutput(ctx, `Messenger mode: ${current}`);
        return;
      }

      if (requested !== "allowed" && requested !== "blocked") {
        printOutput(ctx, `Unknown messenger mode: ${requested}. Use 'blocked' or 'allowed'.`);
        return;
      }

      state.messengerMode = requested as MessengerMode;
      deps.persistState();
      deps.updateIndicator(ctx);
      printOutput(ctx, `Messenger mode set to ${requested}`);
    },
  });

  pi.registerCommand("team-status", {
    description: "Show current team/project status",
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
      const teams = deps.getTeams();
      const state = deps.getState();
      let requested = args.trim().toLowerCase();

      if (!requested && !state.activeTeamId && ctx.hasUI && teams.length) {
        const options = teams
          .slice()
          .sort((a, b) => a.id.localeCompare(b.id))
          .map((team) => `${team.id} (${team.roles.length} roles)`);
        const selected = await ctx.ui.select("Select team for status", options);
        if (!selected) {
          printOutput(ctx, "Team status cancelled.");
          return;
        }
        requested = selected.split(" ")[0] ?? "";
      }

      if (requested) {
        const team = resolveTeam(teams, requested);
        if (!team) {
          printOutput(ctx, `Unknown team: ${requested}`);
          return;
        }
        deps.setActiveTeamById(team.id);
        deps.persistState();
        deps.updateIndicator(ctx);
      }

      const nextState = deps.getState();
      const activeTeam = nextState.activeTeamId ? resolveTeam(teams, nextState.activeTeamId) : undefined;
      printOutput(ctx, renderStatusPanel(nextState, activeTeam));
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
