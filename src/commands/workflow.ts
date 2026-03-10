import type { ExtensionAPI, ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import type { OrchestratorState } from "../state/types";

interface WorkflowCommandDeps {
  getState: () => OrchestratorState;
}

export function registerWorkflowCommands(pi: ExtensionAPI, deps: WorkflowCommandDeps) {
  pi.registerCommand("agent-status", {
    description: "Show role states for the active project",
    handler: async (_args, ctx) => {
      const project = getActiveProject(deps.getState());
      if (!project) {
        printOutput(ctx, "No active project");
        return;
      }

      const statuses = Object.values(project.roleStatuses).sort((a, b) => {
        const aTs = a.updatedAt ?? "";
        const bTs = b.updatedAt ?? "";
        return bTs.localeCompare(aTs);
      });

      if (!statuses.length) {
        printOutput(ctx, "No role activity yet");
        return;
      }

      const text = statuses
        .map(
          (status) =>
            `- ${status.roleId}: ${status.state}${status.taskId ? ` (task: ${status.taskId})` : ""}${
              status.summary ? ` — ${status.summary}` : ""
            }${status.updatedAt ? ` [${status.updatedAt}]` : ""}`,
        )
        .join("\n");

      printOutput(ctx, text);
    },
  });

  pi.registerCommand("handoff-log", {
    description: "Show recent handoffs",
    handler: async (_args, ctx) => {
      const project = getActiveProject(deps.getState());
      if (!project) {
        printOutput(ctx, "No active project");
        return;
      }

      if (!project.handoffs.length) {
        printOutput(ctx, "No handoffs yet");
        return;
      }

      const text = project.handoffs
        .slice(-20)
        .map((handoff) => {
          const blockers = handoff.blockers?.length ? ` | blockers: ${handoff.blockers.join("; ")}` : "";
          return `- [${handoff.timestamp}] ${handoff.fromRoleId} -> ${handoff.toRoleId} | task: ${handoff.taskId} | ${handoff.summary}${blockers}`;
        })
        .join("\n");

      printOutput(ctx, text);
    },
  });

  pi.registerCommand("workflow-next", {
    description: "Show the current likely next workflow step",
    handler: async (_args, ctx) => {
      const project = getActiveProject(deps.getState());
      if (!project) {
        printOutput(ctx, "No active project");
        return;
      }

      if (project.blockers.length) {
        const top = project.blockers[0];
        printOutput(ctx, `Blocked (${top.severity}): ${top.summary}${top.nextAction ? ` | next: ${top.nextAction}` : ""}`);
        return;
      }

      if (!project.currentTask) {
        printOutput(ctx, "No current task");
        return;
      }

      if (!project.currentTask.assignedRoleId) {
        printOutput(ctx, `Current task '${project.currentTask.title}' is unassigned`);
        return;
      }

      printOutput(
        ctx,
        `Current task '${project.currentTask.title}' is with ${project.currentTask.assignedRoleId} (status: ${project.currentTask.status})`,
      );
    },
  });
}

function getActiveProject(state: OrchestratorState) {
  if (!state.activeProjectId) return undefined;
  return state.projects[state.activeProjectId];
}

function printOutput(ctx: ExtensionCommandContext, text: string) {
  if (ctx.hasUI) {
    ctx.ui.setEditorText(text);
    return;
  }
  console.log(text);
}
