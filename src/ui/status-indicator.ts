import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import type { OrchestratorState, TeamConfig } from "../state/types";
import { renderTeamBoard } from "./team-board";

export function updateStatusIndicator(ctx: ExtensionContext, state: OrchestratorState, teams: TeamConfig[]) {
  if (!ctx.hasUI) return;

  const activeTeam = resolveActiveTeam(state, teams);
  const project = state.activeProjectId ? state.projects[state.activeProjectId] : undefined;
  const phase = project?.currentPhase ?? activeTeam?.defaultPhase ?? "none";
  const mode = state.footerMode === "compact" ? "compact" : "rich";

  if (mode === "compact") {
    const status = [`team:${activeTeam?.id ?? "none"}`, `project:${project?.name ?? "none"}`, `phase:${phase}`].join(" | ");
    ctx.ui.setStatus("team-orchestrator", status);
  } else {
    const richStatus = [
      `team:${activeTeam?.id ?? "none"}`,
      `project:${project?.name ?? "none"}`,
      `phase:${phase}`,
      `brief:${project?.workflow?.briefPath ? "set" : "missing"}`,
      `checkpoint:${project?.workflow?.latestCheckpointPath ? "set" : "none"}`,
      `blockers:${project?.blockers.length ?? 0}`,
    ].join(" | ");

    ctx.ui.setStatus("team-orchestrator", richStatus);
  }

  if (state.teamBoardMode === "off") {
    ctx.ui.setWidget("team-orchestrator:board", undefined);
    return;
  }

  const boardLines = renderTeamBoard(state, activeTeam);
  ctx.ui.setWidget("team-orchestrator:board", boardLines, { placement: "belowEditor" });
}

function resolveActiveTeam(state: OrchestratorState, teams: TeamConfig[]): TeamConfig | undefined {
  if (state.activeTeamId) {
    return teams.find((team) => team.id === state.activeTeamId);
  }
  if (!state.activeProjectId) return undefined;
  const project = state.projects[state.activeProjectId];
  if (!project?.boundTeamId) return undefined;
  return teams.find((team) => team.id === project.boundTeamId);
}
