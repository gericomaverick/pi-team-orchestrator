import { StringEnum } from "@mariozechner/pi-ai";
import { Type } from "@sinclair/typebox";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { appendProjectLogLine, formatLogLine } from "../state/project-log";
import type { OrchestratorState } from "../state/types";

const BlockerParams = Type.Object({
  severity: StringEnum(["low", "medium", "high"] as const),
  summary: Type.String(),
  roleId: Type.Optional(Type.String()),
  taskId: Type.Optional(Type.String()),
  nextAction: Type.Optional(Type.String()),
});

export function registerBlockerTool(
  pi: ExtensionAPI,
  getState: () => OrchestratorState,
  persistState: () => void,
  updateIndicator: (ctx: ExtensionContext) => void,
) {
  pi.registerTool({
    name: "team_blocker",
    label: "Team Blocker",
    description: "Record a workflow blocker on the active project",
    parameters: BlockerParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const state = getState();
      const project = state.activeProjectId ? state.projects[state.activeProjectId] : undefined;
      if (!project) {
        return { content: [{ type: "text", text: "No active project" }] };
      }

      const timestamp = new Date().toISOString();
      const id = `blocker-${Date.now()}`;
      project.blockers.push({
        id,
        severity: params.severity,
        summary: params.summary,
        roleId: params.roleId,
        taskId: params.taskId,
        nextAction: params.nextAction,
      });

      appendProjectLogLine(
        project.cwd,
        formatLogLine(
          timestamp,
          "blocker",
          `severity=${params.severity}${params.roleId ? ` role=${params.roleId}` : ""}${params.taskId ? ` task=${params.taskId}` : ""} | ${params.summary}${params.nextAction ? ` | next: ${params.nextAction}` : ""}`,
        ),
      );

      persistState();
      updateIndicator(ctx);

      return {
        content: [
          {
            type: "text",
            text: `Recorded blocker ${id} (${params.severity})`,
          },
        ],
      };
    },
  });
}
