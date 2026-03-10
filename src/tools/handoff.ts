import { Type } from "@sinclair/typebox";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { appendProjectLogLine, formatLogLine } from "../state/project-log";
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

      const timestamp = new Date().toISOString();
      const handoffId = `${Date.now()}`;

      project.handoffs.push({
        id: handoffId,
        fromRoleId: params.fromRoleId,
        toRoleId: params.toRoleId,
        taskId: params.taskId,
        summary: params.summary,
        deliverables: params.deliverables,
        blockers: params.blockers,
        timestamp,
      });

      project.checkpoints.push({
        id: `checkpoint-${handoffId}`,
        timestamp,
        roleId: params.fromRoleId,
        summary: `Handoff to ${params.toRoleId}: ${params.summary}`,
        status: "handoff",
        taskId: params.taskId,
        nextRoleId: params.toRoleId,
        evidence: params.deliverables,
      });

      appendProjectLogLine(
        project.cwd,
        formatLogLine(
          timestamp,
          "handoff",
          `${params.fromRoleId} -> ${params.toRoleId} task=${params.taskId} | ${params.summary} | deliverables: ${params.deliverables.join("; ")}${
            params.blockers?.length ? ` | blockers: ${params.blockers.join("; ")}` : ""
          }`,
        ),
      );

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
