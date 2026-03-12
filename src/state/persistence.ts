import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import type { OrchestratorState, PersistedOrchestratorState } from "./types";

const ENTRY_TYPE = "team-orchestrator-state";

/**
 * Pi API assumption:
 * - `pi.appendEntry(customType, data)` writes a branch-aware custom session entry.
 * - On restore we should read from `ctx.sessionManager.getBranch()` and use the latest entry.
 */
export function persistOrchestratorState(pi: ExtensionAPI, state: OrchestratorState) {
  const payload: PersistedOrchestratorState = {
    version: 1,
    savedAt: new Date().toISOString(),
    state,
  };
  pi.appendEntry<PersistedOrchestratorState>(ENTRY_TYPE, payload);
}

export function restoreOrchestratorState(ctx: ExtensionContext): OrchestratorState | undefined {
  let latest: OrchestratorState | undefined;

  for (const entry of ctx.sessionManager.getBranch()) {
    if (entry.type !== "custom" || entry.customType !== ENTRY_TYPE) continue;
    const data = entry.data as PersistedOrchestratorState | OrchestratorState | undefined;
    if (!data) continue;

    const candidate = isPersistedEnvelope(data) ? data.state : data;
    if (isOrchestratorState(candidate)) {
      latest = normalizeState(candidate);
    }
  }

  return latest;
}

function isPersistedEnvelope(value: unknown): value is PersistedOrchestratorState {
  if (!value || typeof value !== "object") return false;
  const maybe = value as Partial<PersistedOrchestratorState>;
  return maybe.version === 1 && typeof maybe.savedAt === "string" && !!maybe.state;
}

function isOrchestratorState(value: unknown): value is OrchestratorState {
  if (!value || typeof value !== "object") return false;
  const maybe = value as Partial<OrchestratorState>;
  return !!maybe.projects && typeof maybe.projects === "object";
}

function normalizeState(input: OrchestratorState): OrchestratorState {
  const projects = Object.fromEntries(
    Object.entries(input.projects ?? {}).map(([projectId, project]) => [
      projectId,
      {
        id: project.id,
        name: project.name ?? project.id,
        cwd: project.cwd,
        boundTeamId: project.boundTeamId,
        milestone: project.milestone,
        currentPhase: project.currentPhase,
        currentTask: project.currentTask,
        blockers: Array.isArray(project.blockers) ? project.blockers : [],
        canonDocs: Array.isArray(project.canonDocs) ? project.canonDocs : [],
        decisions: Array.isArray(project.decisions) ? project.decisions : [],
        handoffs: Array.isArray(project.handoffs) ? project.handoffs : [],
        checkpoints: Array.isArray((project as { checkpoints?: unknown[] }).checkpoints)
          ? ((project as { checkpoints?: unknown[] }).checkpoints ?? [])
          : [],
        tasks: project.tasks && typeof project.tasks === "object" ? project.tasks : {},
        roleStatuses: project.roleStatuses && typeof project.roleStatuses === "object" ? project.roleStatuses : {},
        workflow: project.workflow && typeof project.workflow === "object" ? project.workflow : {},
      },
    ]),
  );

  return {
    activeTeamId: input.activeTeamId,
    activeProjectId: input.activeProjectId,
    footerMode: input.footerMode === "compact" || input.footerMode === "rich" ? input.footerMode : "rich",
    messengerMode: input.messengerMode === "allowed" || input.messengerMode === "blocked" ? input.messengerMode : "blocked",
    teamBoardMode: input.teamBoardMode === "off" || input.teamBoardMode === "on" ? input.teamBoardMode : "on",
    projects,
  };
}
