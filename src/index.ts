import fs from "node:fs";
import path from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { registerProjectCommands } from "./commands/project";
import { registerTeamCommands } from "./commands/team";
import { registerWorkflowCommands } from "./commands/workflow";
import { restoreOrchestratorState, persistOrchestratorState } from "./state/persistence";
import { DEFAULT_STATE, ensureRoleStatusesForTeam, setActiveTeam } from "./state/store";
import { loadTeamsFromMarkdown } from "./state/team-loader";
import { getRelevantDocumentPaths, hydrateProjectFromFiles, syncWorkflowFiles } from "./state/workflow-files";
import type { OrchestratorState, ProjectState, TeamConfig } from "./state/types";
import { registerBlockerTool } from "./tools/blocker";
import { registerCheckpointSignTool } from "./tools/checkpoint-sign";
import { registerDecisionLogTool } from "./tools/decision-log";
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
  if (state.footerMode !== "compact" && state.footerMode !== "rich") {
    state.footerMode = "rich";
  }

  if (state.messengerMode !== "allowed" && state.messengerMode !== "blocked") {
    state.messengerMode = "blocked";
  }

  if (state.teamBoardMode !== "on" && state.teamBoardMode !== "off") {
    state.teamBoardMode = "on";
  }

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

  hydrateProjectFromFiles(project);
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

  registerWorkflowCommands(pi, {
    getState,
    getTeams,
    persistState: persist,
    updateIndicator: refreshIndicator,
  });

  registerHandoffTool(pi, getState, getTeams, persist, refreshIndicator);
  registerRoleStatusTool(pi, getState, getTeams, persist, refreshIndicator);
  registerBlockerTool(pi, getState, getTeams, persist, refreshIndicator);
  registerDecisionLogTool(pi, getState, getTeams, persist, refreshIndicator);
  registerCheckpointSignTool(pi, getState, getTeams, persist, refreshIndicator);

  pi.on("before_agent_start", async (event) => {
    const activeProject = state.activeProjectId ? state.projects[state.activeProjectId] : undefined;
    const activeTeam = resolveActiveTeam(state, teams, activeProject);
    if (activeProject) {
      hydrateProjectFromFiles(activeProject);
      syncWorkflowFiles(activeProject, activeTeam);
    }
    const orchestrationBlock = buildOrchestrationPromptBlock(state, teams);
    if (!orchestrationBlock) return;
    return {
      systemPrompt: `${event.systemPrompt}\n\n${orchestrationBlock}`,
    };
  });

  pi.on("tool_call", async (event) => {
    if (event.toolName !== "pi_messenger") return;
    if (state.messengerMode === "allowed") return;

    return {
      block: true,
      reason:
        "Pi Messenger is blocked by default in this project. Use normal chat + structured team tools (team_role_status, team_handoff, team_blocker, team_decision_log). Run /messenger-mode allowed to override.",
    };
  });

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

function buildOrchestrationPromptBlock(state: OrchestratorState, teams: TeamConfig[]): string {
  const activeProject = state.activeProjectId ? state.projects[state.activeProjectId] : undefined;
  const activeTeam = resolveActiveTeam(state, teams, activeProject);
  const activeRole = activeProject?.workflow?.current?.roleId ?? inferCurrentRole(activeProject);
  const activeRoleConfig = activeTeam?.roles.find((role) => role.id === activeRole);
  const nextRole = activeProject?.workflow?.next?.roleId;
  const previousRole = activeProject?.workflow?.previous?.roleId;
  const relevantPaths = activeProject ? getRelevantDocumentPaths(activeProject, activeRole ?? nextRole, activeProject.workflow?.activeTaskId, activeTeam) : [];
  const requiredDocs = activeTeam && (activeRole || nextRole)
    ? activeTeam.requiredDocsByRole[activeRole ?? nextRole ?? ""] ?? []
    : [];
  const gateIssues = activeProject?.workflow?.gateIssues ?? [];
  const allowedWriteKinds = activeRoleConfig?.allowedWriteKinds?.length ? activeRoleConfig.allowedWriteKinds.join(", ") : "working";
  const outputContract = activeRoleConfig?.outputContract?.length ? activeRoleConfig.outputContract.join(" | ") : "none";
  const doneCriteria = activeRoleConfig?.doneCriteria?.length ? activeRoleConfig.doneCriteria.join(" | ") : "none";

  const contextLines = [
    `- Active team: ${activeTeam?.id ?? "none"}`,
    `- Active project: ${activeProject?.name ?? "none"}`,
    `- Phase: ${activeProject?.currentPhase ?? activeTeam?.defaultPhase ?? "none"}`,
    `- Workflow mode: ${activeProject?.workflow?.mode ?? "lean"}`,
    `- Previous role: ${previousRole ?? "none"}`,
    `- Current role: ${activeRole ?? "none"}`,
    `- Next role: ${nextRole ?? "none"}`,
    `- Current task: ${activeProject?.currentTask?.title ?? "none"}`,
    `- Active task packet: ${activeProject?.workflow?.activeTaskPath ?? "none"}`,
    `- Blockers: ${activeProject?.blockers.length ?? 0}`,
    `- Handoffs: ${activeProject?.handoffs.length ?? 0}`,
    `- Checkpoints: ${activeProject?.checkpoints.length ?? 0}`,
    `- Task registry: ${activeProject?.workflow?.taskRegistryPath ?? "none"}`,
    `- Messenger mode: ${state.messengerMode === "allowed" ? "allowed" : "blocked"}`,
    `- Team board: ${state.teamBoardMode === "off" ? "off" : "on"}`,
    `- Required doc ids for active role: ${requiredDocs.length ? requiredDocs.join(", ") : "none"}`,
    `- Default relevant files: ${relevantPaths.length ? relevantPaths.join(", ") : "none"}`,
    `- Allowed write zones for active role: ${allowedWriteKinds}`,
    `- Output contract for active role: ${outputContract}`,
    `- Done criteria for active role: ${doneCriteria}`,
    `- Gate issues: ${gateIssues.length ? gateIssues.join("; ") : "none"}`,
    `- Resume summary: ${activeProject?.workflow?.resumeSummary ?? "none"}`,
  ];

  return [
    "[Team Orchestrator Mode]",
    "Treat the user's normal chat input as direct instructions to the active team workflow.",
    "Use the workflow filesystem as the source of truth, not conversational memory.",
    "Preferred coordination primitives:",
    "- team_role_status",
    "- team_handoff",
    "- team_blocker",
    "- team_decision_log",
    "- team_checkpoint_sign",
    "Read only the default read bundle unless the user explicitly asks for broader context.",
    "Do not advance a role when gate issues are present; repair workflow/task/document gaps first.",
    "Do not hand off for every micro-task. Keep ownership until the task packet reaches a resumable boundary.",
    "Only record durable decisions, real blockers, meaningful checkpoints, and genuine ownership changes.",
    "When completing a meaningful step, sign a checkpoint (team_checkpoint_sign), especially at handoffs.",
    "Primary operator commands: /resume, /workflow-status, /task-status, /workflow-next, /session-signoff, /workflow-mode.",
    "Human-facing status commands:",
    "- /resume, /project-brief, /project-migrate, /workflow-status, /workflow-reseed, /task-status, /workflow-mode, /team-status, /project-status, /agent-status, /handoff-log, /blockers, /decision-log, /checkpoint-log, /session-signoff, /team-board, /workflow-next",
    "Do not call pi_messenger unless messenger mode is explicitly set to 'allowed'.",
    gateIssues.length
      ? "Workflow is currently gated. The only acceptable next action is to repair the gate issues before resuming normal work."
      : "Workflow is not gated. Continue the active task from the task packet and latest checkpoint.",
    "Current orchestrator context:",
    ...contextLines,
  ].join("\n");
}

function resolveActiveTeam(
  state: OrchestratorState,
  teams: TeamConfig[],
  activeProject?: ProjectState,
): TeamConfig | undefined {
  const direct = state.activeTeamId ? teams.find((team) => team.id === state.activeTeamId) : undefined;
  if (direct) return direct;
  const boundTeamId = activeProject?.boundTeamId;
  if (!boundTeamId) return undefined;
  return teams.find((team) => team.id === boundTeamId);
}

function inferCurrentRole(project?: ProjectState): string | undefined {
  if (!project) return undefined;
  if (project.currentTask?.assignedRoleId) return project.currentTask.assignedRoleId;
  return Object.values(project.roleStatuses).find((status) =>
    ["reading", "planning", "working", "reviewing", "blocked"].includes(status.state),
  )?.roleId;
}
