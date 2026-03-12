import { StringEnum } from "@mariozechner/pi-ai";
import { Type } from "@sinclair/typebox";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { setRoleState } from "../state/store";
import { canRoleTransition, predictNextRoleId, syncWorkflowFiles, upsertTaskRecord } from "../state/workflow-files";
import type { OrchestratorState, RoleState, TeamConfig } from "../state/types";

const RoleStatusParams = Type.Object({
  roleId: Type.String(),
  state: StringEnum(["idle", "queued", "reading", "planning", "working", "reviewing", "blocked", "done"] as const),
  summary: Type.Optional(Type.String()),
  taskId: Type.Optional(Type.String()),
});

export function registerRoleStatusTool(
  pi: ExtensionAPI,
  getState: () => OrchestratorState,
  getTeams: () => TeamConfig[],
  persistState: () => void,
  updateIndicator: (ctx: ExtensionContext) => void,
) {
  pi.registerTool({
    name: "team_role_status",
    label: "Team Role Status",
    description: "Update the current activity state for a role on the active project",
    parameters: RoleStatusParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const state = getState();
      if (!state.activeProjectId) {
        return { content: [{ type: "text", text: "No active project" }] };
      }

      const project = state.projects[state.activeProjectId];
      const team = getTeams().find((candidate) => candidate.id === project.boundTeamId);
      const transition = canRoleTransition(project, team, params.roleId, params.taskId);

      if (!["idle", "queued", "blocked", "done"].includes(params.state) && transition.blocked) {
        return {
          content: [
            {
              type: "text",
              text: `Blocked role transition for ${params.roleId}: ${transition.issues.join(" | ")}`,
            },
          ],
        };
      }

      setRoleState(state, state.activeProjectId, params.roleId, params.state as RoleState, params.summary, params.taskId);

      if (params.taskId || project.currentTask) {
        const taskId = params.taskId ?? project.currentTask?.id ?? "current-scope";
        project.currentTask = {
          id: taskId,
          title: project.currentTask?.title ?? taskId,
          status:
            params.state === "blocked"
              ? "blocked"
              : params.state === "reviewing"
                ? "review"
                : params.state === "done"
                  ? "done"
                  : params.state === "planning" || params.state === "reading"
                    ? "planned"
                    : "working",
          assignedRoleId: params.roleId,
        };
        upsertTaskRecord(project, {
          ...project.currentTask,
          summary: params.summary,
          nextRoleId: predictNextRoleId(team, params.roleId),
          checkpointPath: project.workflow?.latestCheckpointPath,
          updatedAt: new Date().toISOString(),
        });
      }

      project.workflow = {
        ...(project.workflow ?? {}),
        current: {
          roleId: params.roleId,
          status: params.state,
          taskId: params.taskId,
          summary: params.summary,
          updatedAt: new Date().toISOString(),
        },
        next:
          project.workflow?.next?.roleId && project.workflow.next.roleId !== params.roleId
            ? project.workflow.next
            : {
                roleId: predictNextRoleId(team, params.roleId),
                status: "queued",
                taskId: params.taskId,
                updatedAt: new Date().toISOString(),
              },
        updatedAt: new Date().toISOString(),
      };
      syncWorkflowFiles(project, team);

      persistState();
      updateIndicator(ctx);

      return {
        content: [
          {
            type: "text",
            text: `Updated ${params.roleId} to ${params.state}`,
          },
        ],
      };
    },
  });
}
