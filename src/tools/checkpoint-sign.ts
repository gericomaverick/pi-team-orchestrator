import { StringEnum } from "@mariozechner/pi-ai";
import { Type } from "@sinclair/typebox";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { buildCheckpointSummary, inferCurrentRoleId } from "../state/checkpoint-summary";
import { appendProjectLogLine, formatLogLine } from "../state/project-log";
import type { CheckpointEntry, OrchestratorState } from "../state/types";

const CheckpointSignParams = Type.Object({
  roleId: Type.Optional(Type.String()),
  summary: Type.Optional(Type.String()),
  status: Type.Optional(StringEnum(["in_progress", "handoff", "done", "blocked"] as const)),
  taskId: Type.Optional(Type.String()),
  nextRoleId: Type.Optional(Type.String()),
  evidence: Type.Optional(Type.Array(Type.String())),
});

export function registerCheckpointSignTool(
  pi: ExtensionAPI,
  getState: () => OrchestratorState,
  persistState: () => void,
  updateIndicator: (ctx: ExtensionContext) => void,
) {
  pi.registerTool({
    name: "team_checkpoint_sign",
    label: "Team Checkpoint Sign",
    description: "Sign a workflow checkpoint for the active project",
    parameters: CheckpointSignParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const state = getState();
      const project = state.activeProjectId ? state.projects[state.activeProjectId] : undefined;
      if (!project) {
        return { content: [{ type: "text", text: "No active project" }] };
      }

      const timestamp = new Date().toISOString();
      const status = params.status ?? "done";
      const roleId = params.roleId ?? inferCurrentRoleId(project) ?? "orchestrator";
      const summary = buildCheckpointSummary(project, {
        roleId,
        status,
        taskId: params.taskId,
        nextRoleId: params.nextRoleId,
        summaryHint: params.summary,
      });

      const entry: CheckpointEntry = {
        id: `checkpoint-${Date.now()}`,
        timestamp,
        roleId,
        summary,
        status,
        taskId: params.taskId,
        nextRoleId: params.nextRoleId,
        evidence: params.evidence,
      };

      project.checkpoints.push(entry);

      appendProjectLogLine(
        project.cwd,
        formatLogLine(
          timestamp,
          "checkpoint",
          `role=${entry.roleId} status=${entry.status}${entry.taskId ? ` task=${entry.taskId}` : ""}${entry.nextRoleId ? ` next=${entry.nextRoleId}` : ""} | ${entry.summary}${entry.evidence?.length ? ` | evidence: ${entry.evidence.join("; ")}` : ""}`,
        ),
      );

      persistState();
      updateIndicator(ctx);

      return {
        content: [
          {
            type: "text",
            text: `Signed checkpoint ${entry.id} (${entry.roleId}, ${entry.status}) | ${entry.summary}${params.summary ? "" : " [auto]"}`,
          },
        ],
      };
    },
  });
}
