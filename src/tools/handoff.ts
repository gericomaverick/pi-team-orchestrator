import { Type } from "@sinclair/typebox";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import type { OrchestratorState } from "../state/types";

const HandoffParams = Type.Object({
  fromRoleId: Type.String(),
  toRoleId: Type.String(),
  taskId: Type.String(),
  summary: Type.String(),
  deliverables: Type.Array(Type.String()),
  blockers: Type.Optional(Type.Array(Type.String())),
});

export function registerHandoffTool(
  pi: ExtensionAPI,
  getState: () => OrchestratorState,
  persistState: () => void,
  updateIndicator: (ctx: ExtensionContext) => void,
) {
  pi.registerTool({
    name: "team_handoff",
    label: "Team Handoff",
    description: "Record a handoff between roles for the active project",
    parameters: HandoffParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const state = getState();
      const project = state.activeProjectId ? state.projects[state.activeProjectId] : undefined;
      if (!project) {
        return { content: [{ type: "text", text: "No active project" }] };
      }

      project.handoffs.push({
        id: `${Date.now()}`,
        fromRoleId: params.fromRoleId,
        toRoleId: params.toRoleId,
        taskId: params.taskId,
        summary: params.summary,
        deliverables: params.deliverables,
        blockers: params.blockers,
        timestamp: new Date().toISOString(),
      });

      persistState();
      updateIndicator(ctx);

      return {
        content: [
          {
            type: "text",
            text: `Recorded handoff ${params.fromRoleId} -> ${params.toRoleId} for task ${params.taskId}`,
          },
        ],
      };
    },
  });
}
