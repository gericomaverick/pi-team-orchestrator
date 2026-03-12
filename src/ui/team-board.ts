import { readLatestRoleHint } from "../state/project-log";
import type { OrchestratorState, TeamConfig, WorkflowRoleSlot } from "../state/types";

const CARD_WIDTH = 26;

export function renderTeamBoard(state: OrchestratorState, activeTeam?: TeamConfig): string[] {
  const project = state.activeProjectId ? state.projects[state.activeProjectId] : undefined;

  if (!project) {
    return ["Workflow Lane", "No active project"];
  }

  const diskHint = readLatestRoleHint(project.cwd);
  const previous = project.workflow?.previous;
  const current =
    project.workflow?.current ??
    (diskHint.roleId
      ? {
          roleId: diskHint.roleId,
          status: diskHint.status ?? "queued",
          summary: "recovered from disk",
        }
      : undefined);
  const next = project.workflow?.next;

  const cards = [
    buildCard("Previous", previous, activeTeam),
    buildCard("Current", current, activeTeam),
    buildCard("Next", next, activeTeam),
  ];

  const lines = ["Workflow Lane"];
  for (let i = 0; i < cards[0]!.length; i += 1) {
    lines.push(cards.map((card) => card[i]).join("  "));
  }

  if (project.workflow?.latestCheckpointPath) {
    lines.push(`checkpoint: ${project.workflow.latestCheckpointPath}`);
  }
  if (project.workflow?.activeTaskId) {
    lines.push(`task: ${project.workflow.activeTaskId}`);
  }
  if (project.workflow?.gateIssues?.length) {
    lines.push(`gates: ${project.workflow.gateIssues.join(" | ")}`);
  }

  return lines;
}

function buildCard(label: string, slot: WorkflowRoleSlot | undefined, activeTeam?: TeamConfig): string[] {
  const roleLabel = slot?.roleId ? roleName(activeTeam, slot.roleId) : "none";
  const top = edge(` ${label} `);
  const role = line(`role : ${roleLabel}`);
  const state = line(`state: ${slot?.status ?? "idle"}`);
  const task = line(`task : ${slot?.taskId ?? "none"}`);
  const note = line(`note : ${truncate(slot?.summary ?? "-", CARD_WIDTH - 10)}`);
  const bottom = `└${"─".repeat(CARD_WIDTH - 2)}┘`;
  return [top, role, state, task, note, bottom];
}

function roleName(team: TeamConfig | undefined, roleId: string) {
  return team?.roles.find((role) => role.id === roleId)?.name ?? roleId;
}

function edge(title: string) {
  return `┌${title}${"─".repeat(Math.max(0, CARD_WIDTH - title.length - 2))}┐`;
}

function line(content: string) {
  const clipped = truncate(content, CARD_WIDTH - 4);
  return `│ ${clipped}${" ".repeat(Math.max(0, CARD_WIDTH - clipped.length - 4))} │`;
}

function truncate(value: string, max: number) {
  if (value.length <= max) return value;
  if (max <= 1) return value.slice(0, max);
  return `${value.slice(0, max - 1)}…`;
}
