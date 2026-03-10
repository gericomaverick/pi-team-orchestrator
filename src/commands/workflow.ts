import type { ExtensionAPI, ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { buildCheckpointSummary, inferCurrentRoleId } from "../state/checkpoint-summary";
import { appendProjectLogLine, formatLogLine, readLatestRoleHint, readProjectLogTail } from "../state/project-log";
import type { CheckpointEntry, OrchestratorState } from "../state/types";

interface WorkflowCommandDeps {
  getState: () => OrchestratorState;
  persistState: () => void;
  updateIndicator: (ctx: ExtensionCommandContext) => void;
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

  pi.registerCommand("blockers", {
    description: "Show active blockers",
    handler: async (_args, ctx) => {
      const project = getActiveProject(deps.getState());
      if (!project) {
        printOutput(ctx, "No active project");
        return;
      }

      if (!project.blockers.length) {
        printOutput(ctx, "No blockers");
        return;
      }

      const text = project.blockers
        .slice(-20)
        .map((blocker) => {
          const role = blocker.roleId ? ` | role: ${blocker.roleId}` : "";
          const task = blocker.taskId ? ` | task: ${blocker.taskId}` : "";
          const next = blocker.nextAction ? ` | next: ${blocker.nextAction}` : "";
          return `- [${blocker.severity}] ${blocker.summary}${role}${task}${next}`;
        })
        .join("\n");

      printOutput(ctx, text);
    },
  });

  pi.registerCommand("decision-log", {
    description: "Show recent decision entries",
    handler: async (_args, ctx) => {
      const project = getActiveProject(deps.getState());
      if (!project) {
        printOutput(ctx, "No active project");
        return;
      }

      if (!project.decisions.length) {
        printOutput(ctx, "No decisions logged yet");
        return;
      }

      const text = project.decisions
        .slice(-20)
        .map((decision) => {
          const rationale = decision.rationale ? ` | why: ${decision.rationale}` : "";
          return `- [${decision.timestamp}] ${decision.title}: ${decision.decision}${rationale}`;
        })
        .join("\n");

      printOutput(ctx, text);
    },
  });

  pi.registerCommand("checkpoint-sign", {
    description: "Sign a checkpoint for current progress/handoff",
    handler: async (args, ctx) => {
      const project = getActiveProject(deps.getState());
      if (!project) {
        printOutput(ctx, "No active project");
        return;
      }

      const parsed = parseCheckpointArgs(args);
      const signed = signCheckpoint(project, parsed, "done", "checkpoint");

      deps.persistState();
      deps.updateIndicator(ctx);

      printOutput(
        ctx,
        `Signed checkpoint ${signed.entry.id}: ${signed.entry.roleId} (${signed.entry.status})${signed.entry.nextRoleId ? ` -> ${signed.entry.nextRoleId}` : ""} | ${signed.entry.summary}${signed.autoSummary ? " [auto]" : ""}`,
      );
    },
  });

  pi.registerCommand("checkpoint-log", {
    description: "Show recent checkpoint signatures and handoff events",
    handler: async (_args, ctx) => {
      const project = getActiveProject(deps.getState());
      if (!project) {
        printOutput(ctx, "No active project");
        return;
      }

      const inMemory = project.checkpoints
        .slice(-20)
        .map(
          (entry) =>
            `- [${entry.timestamp}] ${entry.roleId} (${entry.status})${entry.taskId ? ` task:${entry.taskId}` : ""}${entry.nextRoleId ? ` -> ${entry.nextRoleId}` : ""} | ${entry.summary}`,
        );

      const diskEvents = readProjectLogTail(project.cwd, 20);

      const lines = [
        "In-memory checkpoints:",
        ...(inMemory.length ? inMemory : ["- none"]),
        "",
        `Project log file events (${project.cwd ? `${project.cwd}/.pi-orchestrator/checkpoints.md` : "no project path"}):`,
        ...(diskEvents.length ? diskEvents : ["- none"]),
      ];

      printOutput(ctx, lines.join("\n"));
    },
  });

  pi.registerCommand("session-signoff", {
    description: "Record an end-of-session checkpoint and print a resume card",
    handler: async (args, ctx) => {
      const state = deps.getState();
      const project = getActiveProject(state);
      if (!project) {
        printOutput(ctx, "No active project");
        return;
      }

      const parsed = parseCheckpointArgs(args);
      const signed = signCheckpoint(project, parsed, "handoff", "signoff");

      deps.persistState();
      deps.updateIndicator(ctx);

      const teamId = state.activeTeamId ?? project.boundTeamId ?? "none";
      const topBlocker = project.blockers[0]?.summary;
      const resumeCommands = [
        `/project-switch ${project.id}`,
        teamId !== "none" ? `/team-load ${teamId}` : undefined,
        teamId !== "none" ? `/project-bind-team ${teamId}` : undefined,
        "/checkpoint-log",
        "/workflow-next",
        "/agent-status",
        "/handoff-log",
        "/blockers",
      ].filter(Boolean) as string[];

      const lines = [
        `Session signoff recorded: ${signed.entry.id}`,
        `Project: ${project.name}`,
        `Team: ${teamId}`,
        `Checkpoint: ${signed.entry.roleId} (${signed.entry.status})${signed.entry.nextRoleId ? ` -> ${signed.entry.nextRoleId}` : ""} | ${signed.entry.summary}${signed.autoSummary ? " [auto]" : ""}`,
        `Open blockers: ${project.blockers.length}${topBlocker ? ` | top: ${topBlocker}` : ""}`,
        `Checkpoint log: ${project.cwd ? `${project.cwd}/.pi-orchestrator/checkpoints.md` : "(project path unknown)"}`,
        "",
        "Resume with:",
        ...resumeCommands.map((cmd) => `- ${cmd}`),
      ];

      printOutput(ctx, lines.join("\n"));
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
        const latestCheckpoint = project.checkpoints.at(-1);
        if (latestCheckpoint) {
          printOutput(
            ctx,
            `No current task. Latest checkpoint: ${latestCheckpoint.roleId} (${latestCheckpoint.status})${latestCheckpoint.nextRoleId ? ` -> ${latestCheckpoint.nextRoleId}` : ""} | ${latestCheckpoint.summary}`,
          );
          return;
        }

        const diskRoleHint = readLatestRoleHint(project.cwd);
        if (diskRoleHint.sourceLine) {
          const nextRoleNote = diskRoleHint.roleId ? ` Likely next role: ${diskRoleHint.roleId}.` : "";
          printOutput(ctx, `No current task.${nextRoleNote} Latest disk event: ${diskRoleHint.sourceLine}`);
          return;
        }

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

function parseCheckpointArgs(raw: string): {
  roleId?: string;
  status?: "in_progress" | "handoff" | "done" | "blocked";
  taskId?: string;
  nextRoleId?: string;
  summary?: string;
} {
  const tokens = raw
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);

  let roleId: string | undefined;
  let status: "in_progress" | "handoff" | "done" | "blocked" | undefined;
  let taskId: string | undefined;
  let nextRoleId: string | undefined;
  const summaryTokens: string[] = [];

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (token === "--role") {
      roleId = tokens[i + 1];
      i += 1;
      continue;
    }
    if (token === "--status") {
      const candidate = tokens[i + 1];
      if (candidate === "in_progress" || candidate === "handoff" || candidate === "done" || candidate === "blocked") {
        status = candidate;
      }
      i += 1;
      continue;
    }
    if (token === "--task") {
      taskId = tokens[i + 1];
      i += 1;
      continue;
    }
    if (token === "--next") {
      nextRoleId = tokens[i + 1];
      i += 1;
      continue;
    }
    if (token === "--summary") {
      summaryTokens.push(...tokens.slice(i + 1));
      break;
    }
    summaryTokens.push(token);
  }

  return {
    roleId,
    status,
    taskId,
    nextRoleId,
    summary: summaryTokens.join(" ").trim(),
  };
}

function signCheckpoint(
  project: OrchestratorState["projects"][string],
  parsed: ReturnType<typeof parseCheckpointArgs>,
  defaultStatus: "in_progress" | "handoff" | "done" | "blocked",
  logTag: string,
): { entry: CheckpointEntry; autoSummary: boolean } {
  const timestamp = new Date().toISOString();
  const status = parsed.status ?? defaultStatus;
  const roleId = parsed.roleId ?? inferCurrentRoleId(project) ?? "orchestrator";
  const autoSummary = !parsed.summary;
  const summary = buildCheckpointSummary(project, {
    roleId,
    status,
    taskId: parsed.taskId,
    nextRoleId: parsed.nextRoleId,
    summaryHint: parsed.summary,
  });

  const entry: CheckpointEntry = {
    id: `checkpoint-${Date.now()}`,
    timestamp,
    roleId,
    summary,
    status,
    taskId: parsed.taskId,
    nextRoleId: parsed.nextRoleId,
  };

  project.checkpoints.push(entry);

  appendProjectLogLine(
    project.cwd,
    formatLogLine(
      timestamp,
      logTag,
      `role=${entry.roleId} status=${entry.status}${entry.taskId ? ` task=${entry.taskId}` : ""}${entry.nextRoleId ? ` next=${entry.nextRoleId}` : ""} | ${entry.summary}`,
    ),
  );

  return { entry, autoSummary };
}

function printOutput(ctx: ExtensionCommandContext, text: string) {
  if (ctx.hasUI) {
    const lines = text.split(/\r?\n/);
    const head = lines[0] ?? text;
    if (head) ctx.ui.notify(head, "info");

    const maxLines = 20;
    const widgetLines = lines.length > maxLines ? [...lines.slice(0, maxLines), `... (${lines.length - maxLines} more)`] : lines;
    ctx.ui.setWidget("team-orchestrator:last-output", widgetLines, { placement: "belowEditor" });
    return;
  }
  console.log(text);
}
