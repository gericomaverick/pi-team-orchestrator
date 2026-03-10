import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import type { OrchestratorState, TeamConfig } from "../state/types";
import { renderCompactStatus } from "./status-line";

export function updateStatusIndicator(ctx: ExtensionContext, state: OrchestratorState, teams: TeamConfig[]) {
  if (!ctx.hasUI) return;

  const activeTeam = resolveActiveTeam(state, teams);
  const line = renderCompactStatus(state, activeTeam);
  const status = `${ctx.ui.theme.fg("accent", "orchestrator")} ${ctx.ui.theme.fg("dim", line)}`;
  ctx.ui.setStatus("team-orchestrator", status);
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
