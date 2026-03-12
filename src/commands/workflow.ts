import type { ExtensionAPI, ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { buildCheckpointSummary, inferCurrentRoleId } from "../state/checkpoint-summary";
import { appendProjectLogLine, formatLogLine, readLatestRoleHint, readProjectLogTail } from "../state/project-log";
import {
  canCheckpointTransition,
  getRelevantDocumentPaths,
  hydrateProjectFromFiles,
  migrateProjectWorkflow,
  predictNextRoleId,
  setWorkflowMode,
  syncWorkflowFiles,
  writeCheckpointPacket,
} from "../state/workflow-files";
import type { CheckpointEntry, OrchestratorState, TeamConfig, WorkflowMode } from "../state/types";

interface WorkflowCommandDeps {
  getState: () => OrchestratorState;
  getTeams: () => TeamConfig[];
  persistState: () => void;
  updateIndicator: (ctx: ExtensionCommandContext) => void;
}

export function registerWorkflowCommands(pi: ExtensionAPI, deps: WorkflowCommandDeps) {
  pi.registerCommand("workflow-status", {
    description: "Show concise workflow state and role-scoped files",
    handler: async (_args, ctx) => {
      const state = deps.getState();
      const project = getActiveProject(state);
      if (!project) {
        printOutput(ctx, "No active project");
        return;
      }

      hydrateProjectFromFiles(project);
      const team = deps.getTeams().find((candidate) => candidate.id === project.boundTeamId);
      syncWorkflowFiles(project, team);

      const previous = formatWorkflowSlot(project.workflow?.previous);
      const current = formatWorkflowSlot(project.workflow?.current);
      const next = formatWorkflowSlot(project.workflow?.next);
      const relevantPaths = getRelevantDocumentPaths(
        project,
        project.workflow?.current?.roleId ?? project.workflow?.next?.roleId,
        project.workflow?.activeTaskId,
        team,
      );

      const lines = [
        `Project: ${project.name}`,
        `Phase: ${project.currentPhase ?? team?.defaultPhase ?? "none"}`,
        `Mode: ${project.workflow?.mode ?? "lean"}`,
        `Previous: ${previous}`,
        `Current: ${current}`,
        `Next: ${next}`,
        `Active task: ${project.workflow?.activeTaskId ?? "none"}`,
        `Task packet: ${project.workflow?.activeTaskPath ?? "none"}`,
        `Task registry: ${project.workflow?.taskRegistryPath ?? "none"}`,
        `Brief: ${project.workflow?.briefPath ?? "none"}`,
        `Latest checkpoint: ${project.workflow?.latestCheckpointPath ?? "none"}`,
        `Open blockers: ${project.blockers.length}`,
        "Gate issues:",
        ...(project.workflow?.gateIssues?.length ? project.workflow.gateIssues.map((item) => `- ${item}`) : ["- none"]),
        "Stale docs:",
        ...(project.workflow?.staleDocIds?.length ? project.workflow.staleDocIds.map((item) => `- ${item}`) : ["- none"]),
        "Resume summary:",
        project.workflow?.resumeSummary ?? "- none",
        "Relevant files:",
        ...(relevantPaths.length ? relevantPaths.map((item) => `- ${item}`) : ["- none"]),
      ];

      deps.persistState();
      deps.updateIndicator(ctx);
      printOutput(ctx, lines.join("\n"));
    },
  });

  pi.registerCommand("resume", {
    description: "Show the exact resumable task packet, read bundle, and gate state for the active workflow lane",
    handler: async (_args, ctx) => {
      const state = deps.getState();
      const project = getActiveProject(state);
      if (!project) {
        printOutput(ctx, "No active project");
        return;
      }

      hydrateProjectFromFiles(project);
      const team = deps.getTeams().find((candidate) => candidate.id === project.boundTeamId);
      syncWorkflowFiles(project, team);

      const currentRoleId = project.workflow?.current?.roleId ?? project.workflow?.next?.roleId ?? "none";
      const relevantPaths = getRelevantDocumentPaths(project, currentRoleId, project.workflow?.activeTaskId, team);
      const lines = [
        `Resume role: ${currentRoleId}`,
        `Task: ${project.workflow?.activeTaskId ?? "none"}`,
        `Task packet: ${project.workflow?.activeTaskPath ?? "none"}`,
        `Latest checkpoint: ${project.workflow?.latestCheckpointPath ?? "none"}`,
        `Mode: ${project.workflow?.mode ?? "lean"}`,
        `Summary: ${project.workflow?.resumeSummary ?? "none"}`,
        "Gate issues:",
        ...(project.workflow?.gateIssues?.length ? project.workflow.gateIssues.map((item) => `- ${item}`) : ["- none"]),
        "Read bundle:",
        ...(relevantPaths.length ? relevantPaths.map((item) => `- ${item}`) : ["- none"]),
      ];

      deps.persistState();
      deps.updateIndicator(ctx);
      printOutput(ctx, lines.join("\n"));
    },
  });

  pi.registerCommand("workflow-mode", {
    description: "Show or set workflow strictness mode: lean | delivery | recovery",
    handler: async (args, ctx) => {
      const project = getActiveProject(deps.getState());
      if (!project) {
        printOutput(ctx, "No active project");
        return;
      }

      const requested = args.trim().toLowerCase();
      const team = deps.getTeams().find((candidate) => candidate.id === project.boundTeamId);
      if (!requested) {
        printOutput(ctx, `Workflow mode: ${project.workflow?.mode ?? "lean"}`);
        return;
      }
      if (!["lean", "delivery", "recovery"].includes(requested)) {
        printOutput(ctx, "Usage: /workflow-mode [lean|delivery|recovery]");
        return;
      }

      setWorkflowMode(project, requested as WorkflowMode, team);
      deps.persistState();
      deps.updateIndicator(ctx);
      printOutput(ctx, `Workflow mode set to ${requested}`);
    },
  });

  pi.registerCommand("workflow-reseed", {
    description: "Reseed file-backed workflow state from legacy logs and existing docs",
    handler: async (_args, ctx) => {
      const state = deps.getState();
      const project = getActiveProject(state);
      if (!project) {
        printOutput(ctx, "No active project");
        return;
      }

      hydrateProjectFromFiles(project);
      const team = deps.getTeams().find((candidate) => candidate.id === project.boundTeamId);
      const result = migrateProjectWorkflow(project, team);

      deps.persistState();
      deps.updateIndicator(ctx);

      const lines = [
        result.summary,
        `Brief: ${result.briefPath ?? project.workflow?.briefPath ?? "none"}`,
        `Task registry: ${result.taskRegistryPath ?? project.workflow?.taskRegistryPath ?? "none"}`,
        `Checkpoint: ${result.checkpointPath ?? project.workflow?.latestCheckpointPath ?? "none"}`,
        ...(result.warnings.length ? ["Warnings:", ...result.warnings.map((item) => `- ${item}`)] : []),
      ];
      printOutput(ctx, lines.join("\n"));
    },
  });

  pi.registerCommand("task-status", {
    description: "Show the compact on-disk task registry",
    handler: async (_args, ctx) => {
      const project = getActiveProject(deps.getState());
      if (!project) {
        printOutput(ctx, "No active project");
        return;
      }

      hydrateProjectFromFiles(project);
      const tasks = Object.values(project.tasks ?? {}).sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
      if (!tasks.length) {
        printOutput(ctx, "No tasks in registry");
        return;
      }

      const lines = tasks.slice(0, 12).map(
        (task) =>
          `- ${task.id}: ${task.status}${task.assignedRoleId ? ` | owner:${task.assignedRoleId}` : ""}${task.nextRoleId ? ` | next:${task.nextRoleId}` : ""}${task.packetPath ? ` | packet:${task.packetPath}` : ""}${task.summary ? ` | ${task.summary}` : ""}`,
      );
      printOutput(ctx, [`Task registry: ${project.workflow?.taskRegistryPath ?? "none"}`, ...lines].join("\n"));
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

      hydrateProjectFromFiles(project);
      const team = deps.getTeams().find((candidate) => candidate.id === project.boundTeamId);
      syncWorkflowFiles(project, team);

      if (project.workflow?.gateIssues?.length) {
        printOutput(ctx, `Workflow gated: ${project.workflow.gateIssues.join(" | ")}`);
        return;
      }

      if (project.blockers.length) {
        const top = project.blockers[0];
        printOutput(ctx, `Blocked (${top.severity}): ${top.summary}${top.nextAction ? ` | next: ${top.nextAction}` : ""}`);
        return;
      }

      if (!project.currentTask) {
        const nextRole = project.workflow?.current?.roleId ?? project.workflow?.next?.roleId ?? readLatestRoleHint(project.cwd).roleId;
        const checkpointPath = project.workflow?.latestCheckpointPath ?? "none";
        printOutput(ctx, `No current task. Current workflow owner: ${nextRole ?? "none"} | checkpoint: ${checkpointPath}`);
        return;
      }

      if (!project.currentTask.assignedRoleId) {
        printOutput(ctx, `Current task '${project.currentTask.title}' is unassigned`);
        return;
      }

      printOutput(
        ctx,
        `Current task '${project.currentTask.title}' is with ${project.currentTask.assignedRoleId} (status: ${project.currentTask.status})${project.workflow?.next?.roleId ? ` | next: ${project.workflow.next.roleId}` : ""}`,
      );
    },
  });

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
            `- ${status.roleId}: ${status.state}${status.taskId ? ` (task: ${status.taskId})` : ""}${status.summary ? ` | ${status.summary}` : ""}${status.updatedAt ? ` [${status.updatedAt}]` : ""}`,
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
    description: "Sign a checkpoint for current progress or handoff",
    handler: async (args, ctx) => {
      const project = getActiveProject(deps.getState());
      if (!project) {
        printOutput(ctx, "No active project");
        return;
      }

      const parsed = parseCheckpointArgs(args);
      const team = deps.getTeams().find((candidate) => candidate.id === project.boundTeamId);
      const roleId = parsed.roleId ?? inferCurrentRoleId(project) ?? "orchestrator";
      const transition = canCheckpointTransition(
        project,
        team,
        roleId,
        parsed.taskId,
        parsed.nextRoleId,
        project.currentTask?.evidence,
      );
      if (transition.blocked && (parsed.status ?? "done") !== "blocked") {
        printOutput(ctx, `Blocked checkpoint for ${roleId}: ${transition.issues.join(" | ")}`);
        return;
      }

      const signed = signCheckpoint(project, parsed, "done", "checkpoint", team);
      writeCheckpointPacket(project, signed.entry, {
        blockers: project.blockers,
        evidence: signed.entry.evidence,
        team,
      });
      syncWorkflowFiles(project, team);

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

      hydrateProjectFromFiles(project);

      const inMemory = project.checkpoints
        .slice(-20)
        .map(
          (entry) =>
            `- [${entry.timestamp}] ${entry.roleId} (${entry.status})${entry.taskId ? ` task:${entry.taskId}` : ""}${entry.nextRoleId ? ` -> ${entry.nextRoleId}` : ""} | ${entry.summary}`,
        );
      const diskEvents = readProjectLogTail(project.cwd, 20);

      const lines = [
        `Latest checkpoint doc: ${project.workflow?.latestCheckpointPath ?? "none"}`,
        "",
        "In-memory checkpoints:",
        ...(inMemory.length ? inMemory : ["- none"]),
        "",
        `Event log (${project.cwd ? `${project.cwd}/.pi-orchestrator/checkpoints.md` : "no project path"}):`,
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
      const team = deps.getTeams().find((candidate) => candidate.id === project.boundTeamId);
      const roleId = parsed.roleId ?? inferCurrentRoleId(project) ?? "orchestrator";
      const transition = canCheckpointTransition(
        project,
        team,
        roleId,
        parsed.taskId,
        parsed.nextRoleId,
        project.currentTask?.evidence,
      );
      if (transition.blocked && (parsed.status ?? "handoff") !== "blocked") {
        printOutput(ctx, `Blocked signoff for ${roleId}: ${transition.issues.join(" | ")}`);
        return;
      }

      const signed = signCheckpoint(project, parsed, "handoff", "signoff", team);
      writeCheckpointPacket(project, signed.entry, {
        blockers: project.blockers,
        evidence: signed.entry.evidence,
        team,
      });
      syncWorkflowFiles(project, team);

      deps.persistState();
      deps.updateIndicator(ctx);

      const teamId = state.activeTeamId ?? project.boundTeamId ?? "none";
      const topBlocker = project.blockers[0]?.summary;
      const resumeCommands = [
        `/project-switch ${project.id}`,
        teamId !== "none" ? `/team-load ${teamId}` : undefined,
        teamId !== "none" ? `/project-bind-team ${teamId}` : undefined,
        "/workflow-status",
      ].filter(Boolean) as string[];

      const lines = [
        `Session signoff recorded: ${signed.entry.id}`,
        `Project: ${project.name}`,
        `Team: ${teamId}`,
        `Checkpoint: ${signed.entry.roleId} (${signed.entry.status})${signed.entry.nextRoleId ? ` -> ${signed.entry.nextRoleId}` : ""} | ${signed.entry.summary}${signed.autoSummary ? " [auto]" : ""}`,
        `Open blockers: ${project.blockers.length}${topBlocker ? ` | top: ${topBlocker}` : ""}`,
        `Workflow status: ${project.cwd ? `${project.cwd}/documents/canonical/workflow-status.md` : "(project path unknown)"}`,
        "",
        "Resume with:",
        ...resumeCommands.map((cmd) => `- ${cmd}`),
      ];

      printOutput(ctx, lines.join("\n"));
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
  team?: TeamConfig,
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

  const predictedNextRoleId = predictNextRoleId(team, entry.nextRoleId ?? roleId);
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
    next: entry.nextRoleId
      ? {
          roleId: predictedNextRoleId,
          status: "queued",
          taskId: entry.taskId,
          updatedAt: entry.timestamp,
        }
      : project.workflow?.next,
    updatedAt: entry.timestamp,
  };

  if (entry.taskId || project.currentTask) {
    const taskId = entry.taskId ?? project.currentTask?.id ?? "current-scope";
    project.currentTask = {
      id: taskId,
      title: project.currentTask?.title ?? taskId,
      status: status === "blocked" ? "blocked" : status === "handoff" ? "planned" : status === "done" ? "done" : "working",
      assignedRoleId: entry.nextRoleId ?? entry.roleId,
    };
  }

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

function formatWorkflowSlot(slot?: { roleId?: string; status?: string; taskId?: string; summary?: string }): string {
  if (!slot?.roleId) return "none";
  return `${slot.roleId} (${slot.status ?? "idle"})${slot.taskId ? ` task:${slot.taskId}` : ""}${slot.summary ? ` | ${slot.summary}` : ""}`;
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
