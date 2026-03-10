import { readLatestRoleHint } from "../state/project-log";
import type { OrchestratorState, RoleState, TeamConfig } from "../state/types";

type BoardRow = {
  roleId: string;
  roleLabel: string;
  state: RoleState | "unknown";
  task?: string;
  note?: string;
};

const CARD_WIDTH = 56;

export function renderTeamBoard(state: OrchestratorState, activeTeam?: TeamConfig): string[] {
  const project = state.activeProjectId ? state.projects[state.activeProjectId] : undefined;

  if (!project) {
    return ["Team Activity Board", "No active project"];
  }

  const roleLabelById = new Map<string, string>();
  for (const role of activeTeam?.roles ?? []) {
    roleLabelById.set(role.id, role.name || role.id);
  }

  const roleIds = new Set<string>([...(activeTeam?.roles.map((role) => role.id) ?? []), ...Object.keys(project.roleStatuses)]);

  const rows: BoardRow[] = [];
  for (const roleId of roleIds) {
    const status = project.roleStatuses[roleId];
    rows.push({
      roleId,
      roleLabel: roleLabelById.get(roleId) ?? roleId,
      state: status?.state ?? "idle",
      task: status?.taskId,
      note: status?.summary,
    });
  }

  const activeRows = rows.filter((row) => !["idle", "done"].includes(row.state));
  const diskHint = readLatestRoleHint(project.cwd);

  if (!activeRows.length && diskHint.roleId) {
    activeRows.push({
      roleId: diskHint.roleId,
      roleLabel: roleLabelById.get(diskHint.roleId) ?? diskHint.roleId,
      state: (diskHint.status as RoleState | undefined) ?? "queued",
      note: "recovered from latest checkpoint",
    });
  }

  activeRows.sort((a, b) => {
    const p = rolePriority(a.state) - rolePriority(b.state);
    if (p !== 0) return p;
    return a.roleId.localeCompare(b.roleId);
  });

  const showRows = activeRows.slice(0, 6);
  const idleCount = rows.filter((row) => row.state === "idle").length;

  const lines = [
    "Team Activity Board",
    `team: ${activeTeam?.id ?? "none"} | project: ${project.name} | phase: ${project.currentPhase ?? activeTeam?.defaultPhase ?? "none"}`,
  ];

  if (!showRows.length) {
    lines.push("No active roles (all idle/done). Use checkpoints/handoffs to queue next role.");
  }

  for (const row of showRows) {
    lines.push(...renderCard(row));
  }

  lines.push(`idle roles: ${idleCount}/${rows.length || 0}`);
  if (activeRows.length > showRows.length) {
    lines.push(`(+${activeRows.length - showRows.length} more active roles not shown)`);
  }

  return lines;
}

function renderCard(row: BoardRow): string[] {
  const header = ` ${row.roleId} `;
  const top = `┌${header}${"─".repeat(Math.max(0, CARD_WIDTH - 2 - header.length))}┐`;
  const stateLine = cardLine(`state: ${row.state}`);
  const taskLine = cardLine(`task : ${row.task ?? "none"}`);
  const noteLine = cardLine(`note : ${truncate(row.note ?? "", CARD_WIDTH - 10) || "-"}`);
  const bottom = `└${"─".repeat(CARD_WIDTH - 2)}┘`;
  return [top, stateLine, taskLine, noteLine, bottom];
}

function cardLine(content: string): string {
  const innerWidth = CARD_WIDTH - 4;
  const clipped = truncate(content, innerWidth);
  return `│ ${clipped}${" ".repeat(Math.max(0, innerWidth - clipped.length))} │`;
}

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  if (max <= 1) return value.slice(0, max);
  return `${value.slice(0, max - 1)}…`;
}

function rolePriority(state: BoardRow["state"]): number {
  switch (state) {
    case "blocked":
      return 0;
    case "working":
      return 1;
    case "reviewing":
      return 2;
    case "planning":
      return 3;
    case "reading":
      return 4;
    case "queued":
      return 5;
    case "idle":
      return 90;
    case "done":
      return 91;
    default:
      return 99;
  }
}
