import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import { readLatestRoleHint } from "../state/project-log";
import type { OrchestratorState, TeamConfig } from "../state/types";
import { renderTeamBoard } from "./team-board";

let richFooterRotation = 0;

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
    const diskRoleHint = readLatestRoleHint(project?.cwd);
    const inMemoryRole = project?.currentTask?.assignedRoleId ?? inferCurrentRole(project);
    const role = inMemoryRole ?? diskRoleHint.roleId;
    const roleState =
      inMemoryRole && role && project?.roleStatuses[role] ? project.roleStatuses[role].state : diskRoleHint.status ?? "idle";
    const handoffs = project?.handoffs.length ?? 0;
    const blockers = project?.blockers.length ?? 0;
    const checkpoints = project?.checkpoints.length ?? 0;
    const activeSummary = summarizeTopActiveRoles(project);

    const richStatus = [
      `team:${activeTeam?.id ?? "none"}`,
      `project:${project?.name ?? "none"}`,
      `phase:${phase}`,
      `role:${role ?? "none"}`,
      `state:${roleState}`,
      `handoffs:${handoffs}`,
      `blockers:${blockers}`,
      `checkpoints:${checkpoints}`,
      `messenger:${state.messengerMode === "allowed" ? "on" : "off"}`,
      `active:${activeSummary}`,
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

function inferCurrentRole(project?: OrchestratorState["projects"][string]): string | undefined {
  if (!project) return undefined;
  const active = Object.values(project.roleStatuses).find((status) =>
    ["reading", "planning", "working", "reviewing", "blocked"].includes(status.state),
  );
  return active?.roleId;
}

function summarizeTopActiveRoles(project?: OrchestratorState["projects"][string]): string {
  if (!project) return "none";

  const statuses = Object.values(project.roleStatuses)
    .filter((status) => status.state !== "idle" && status.state !== "done")
    .sort((a, b) => {
      const priority = rolePriority(a.state) - rolePriority(b.state);
      if (priority !== 0) return priority;
      const aTs = a.updatedAt ? Date.parse(a.updatedAt) : 0;
      const bTs = b.updatedAt ? Date.parse(b.updatedAt) : 0;
      return bTs - aTs;
    });

  if (!statuses.length) return "none";

  const showCount = Math.min(2, statuses.length);
  const start = richFooterRotation % statuses.length;
  richFooterRotation += 1;

  const rotated = Array.from({ length: showCount }, (_, i) => statuses[(start + i) % statuses.length]);
  return rotated.map((status) => `${status.roleId}:${status.state}`).join(",");
}

function rolePriority(state: string): number {
  switch (state) {
    case "blocked":
      return 0;
    case "working":
      return 1;
    case "reviewing":
      return 2;
    case "planning":
      return 3;
    case "reading":
      return 4;
    case "queued":
      return 5;
    default:
      return 99;
  }
}
