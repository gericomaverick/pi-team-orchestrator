import { StringEnum } from "@mariozechner/pi-ai";
import { Type } from "@sinclair/typebox";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { buildCheckpointSummary, inferCurrentRoleId } from "../state/checkpoint-summary";
import { appendProjectLogLine, formatLogLine } from "../state/project-log";
import { canRoleTransition, syncWorkflowFiles, upsertTaskRecord, writeCheckpointPacket } from "../state/workflow-files";
import type { CheckpointEntry, OrchestratorState, TeamConfig } from "../state/types";

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
  getTeams: () => TeamConfig[],
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
      const team = getTeams().find((candidate) => candidate.id === project.boundTeamId);
      const transition = canRoleTransition(project, team, roleId, params.taskId);
      if ((status === "in_progress" || status === "handoff" || status === "done") && transition.blocked) {
        return {
          content: [
            {
              type: "text",
              text: `Blocked checkpoint for ${roleId}: ${transition.issues.join(" | ")}`,
            },
          ],
        };
      }
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

      if (entry.taskId || project.currentTask) {
        const taskId = entry.taskId ?? project.currentTask?.id ?? "current-scope";
        project.currentTask = {
          id: taskId,
          title: project.currentTask?.title ?? taskId,
          status: entry.status === "blocked" ? "blocked" : entry.status === "handoff" ? "done" : entry.status === "done" ? "done" : "working",
          assignedRoleId: entry.nextRoleId ?? entry.roleId,
        };
        upsertTaskRecord(project, {
          ...project.currentTask,
          summary: entry.summary,
          nextRoleId: entry.nextRoleId,
          checkpointPath: project.workflow?.latestCheckpointPath,
          updatedAt: timestamp,
        });
      }

      project.workflow = {
        ...(project.workflow ?? {}),
        previous: {
          roleId: entry.roleId,
          status: entry.status,
          taskId: entry.taskId,
          summary: entry.summary,
          updatedAt: entry.timestamp,
        },
        current: entry.nextRoleId
          ? {
              roleId: entry.nextRoleId,
              status: "queued",
              taskId: entry.taskId,
              summary: entry.summary,
              updatedAt: entry.timestamp,
            }
          : {
              roleId: entry.roleId,
              status: entry.status,
              taskId: entry.taskId,
              summary: entry.summary,
              updatedAt: entry.timestamp,
            },
        updatedAt: entry.timestamp,
      };

      appendProjectLogLine(
        project.cwd,
        formatLogLine(
          timestamp,
          "checkpoint",
          `role=${entry.roleId} status=${entry.status}${entry.taskId ? ` task=${entry.taskId}` : ""}${entry.nextRoleId ? ` next=${entry.nextRoleId}` : ""} | ${entry.summary}${entry.evidence?.length ? ` | evidence: ${entry.evidence.join("; ")}` : ""}`,
        ),
      );

      writeCheckpointPacket(project, entry, {
        blockers: project.blockers,
        evidence: entry.evidence,
        team,
      });
      syncWorkflowFiles(project, team);

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
