import { Type } from "@sinclair/typebox";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { appendProjectLogLine, formatLogLine } from "../state/project-log";
import { canHandoffTransition, syncWorkflowFiles, upsertTaskRecord, writeCheckpointPacket } from "../state/workflow-files";
import type { OrchestratorState, TeamConfig } from "../state/types";

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
  getTeams: () => TeamConfig[],
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
      const team = getTeams().find((candidate) => candidate.id === project.boundTeamId);
      const transition = canHandoffTransition(project, team, params.fromRoleId, params.toRoleId, params.taskId, params.deliverables);
      if (transition.blocked) {
        return {
          content: [
            {
              type: "text",
              text: `Blocked handoff ${params.fromRoleId} -> ${params.toRoleId}: ${transition.issues.join(" | ")}`,
            },
          ],
        };
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

      project.currentTask = {
        id: params.taskId,
        title: params.taskId,
        status: "planned",
        assignedRoleId: params.toRoleId,
        summary: params.summary,
        evidence: params.deliverables,
      };

      if (project.roleStatuses[params.fromRoleId]) {
        project.roleStatuses[params.fromRoleId].state = "done";
        project.roleStatuses[params.fromRoleId].taskId = params.taskId;
        project.roleStatuses[params.fromRoleId].summary = params.summary;
        project.roleStatuses[params.fromRoleId].updatedAt = timestamp;
      }

      project.roleStatuses[params.toRoleId] = {
        roleId: params.toRoleId,
        state: "queued",
        taskId: params.taskId,
        summary: params.summary,
        updatedAt: timestamp,
      };

      project.workflow = {
        ...(project.workflow ?? {}),
        previous: {
          roleId: params.fromRoleId,
          status: "handoff",
          taskId: params.taskId,
          summary: params.summary,
          updatedAt: timestamp,
        },
        current: {
          roleId: params.toRoleId,
          status: "queued",
          taskId: params.taskId,
          summary: params.summary,
          updatedAt: timestamp,
        },
        next: {
          roleId: undefined,
          status: "queued",
          taskId: params.taskId,
          updatedAt: timestamp,
        },
        updatedAt: timestamp,
      };
      upsertTaskRecord(project, {
        id: params.taskId,
        title: params.taskId,
        status: "planned",
        assignedRoleId: params.toRoleId,
        summary: params.summary,
        nextRoleId: params.toRoleId,
        checkpointPath: project.workflow.latestCheckpointPath,
        evidence: params.deliverables,
        relevantPaths: params.deliverables,
        updatedAt: timestamp,
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

      writeCheckpointPacket(project, project.checkpoints.at(-1)!, {
        fromRoleId: params.fromRoleId,
        blockers: project.blockers,
        evidence: params.deliverables,
        team,
      });
      syncWorkflowFiles(project, team);

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
