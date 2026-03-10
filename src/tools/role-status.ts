import { StringEnum } from "@mariozechner/pi-ai";
import { Type } from "@sinclair/typebox";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { setRoleState } from "../state/store";
import type { OrchestratorState, RoleState } from "../state/types";

const RoleStatusParams = Type.Object({
  roleId: Type.String(),
  state: StringEnum(["idle", "queued", "reading", "planning", "working", "reviewing", "blocked", "done"] as const),
  summary: Type.Optional(Type.String()),
  taskId: Type.Optional(Type.String()),
});

export function registerRoleStatusTool(
  pi: ExtensionAPI,
  getState: () => OrchestratorState,
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

      setRoleState(state, state.activeProjectId, params.roleId, params.state as RoleState, params.summary, params.taskId);

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
