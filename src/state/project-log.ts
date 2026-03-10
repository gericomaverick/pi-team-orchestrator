import fs from "node:fs";
import path from "node:path";

const LOG_DIR = ".pi-orchestrator";
const LOG_FILE = "checkpoints.md";

export function appendProjectLogLine(projectCwd: string | undefined, line: string): string | undefined {
  if (!projectCwd) return undefined;

  const dir = path.join(projectCwd, LOG_DIR);
  const filePath = path.join(dir, LOG_FILE);

  fs.mkdirSync(dir, { recursive: true });

  if (!fs.existsSync(filePath)) {
    const header = [
      "# Team Orchestrator Checkpoints",
      "",
      "Auto-generated event log for handoffs and signed checkpoints.",
      "",
      "## Event Log",
      "",
    ].join("\n");
    fs.writeFileSync(filePath, header, "utf8");
  }

  fs.appendFileSync(filePath, `${line}\n`, "utf8");
  return filePath;
}

export function readProjectLogTail(projectCwd: string | undefined, maxItems = 20): string[] {
  if (!projectCwd) return [];

  const filePath = path.join(projectCwd, LOG_DIR, LOG_FILE);
  if (!fs.existsSync(filePath)) return [];

  const lines = fs
    .readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- ["));

  return lines.slice(-maxItems);
}

export function formatLogLine(timestamp: string, tag: string, body: string): string {
  return `- [${timestamp}] [${tag}] ${body}`;
}

export function readLatestRoleHint(projectCwd: string | undefined): { roleId?: string; status?: string; sourceLine?: string } {
  const sourceLine = readProjectLogTail(projectCwd, 1).at(-1);
  if (!sourceLine) return {};

  const parsed = parseRoleHintFromLogLine(sourceLine);
  return {
    roleId: parsed.nextRoleId ?? parsed.roleId,
    status: parsed.nextRoleId ? "queued" : parsed.status,
    sourceLine,
  };
}

function parseRoleHintFromLogLine(line: string): { roleId?: string; nextRoleId?: string; status?: string } {
  const nextRoleId = line.match(/\bnext=([a-z0-9-]+)/i)?.[1];
  const roleId = line.match(/\brole=([a-z0-9-]+)/i)?.[1];
  const status = line.match(/\bstatus=([a-z_]+)/i)?.[1];

  if (nextRoleId || roleId) {
    return {
      roleId: roleId?.toLowerCase(),
      nextRoleId: nextRoleId?.toLowerCase(),
      status: status?.toLowerCase(),
    };
  }

  const handoffMatch = line.match(/\]\s*\[handoff\]\s*([a-z0-9-]+)\s*->\s*([a-z0-9-]+)/i);
  if (handoffMatch) {
    return {
      roleId: handoffMatch[1]?.toLowerCase(),
      nextRoleId: handoffMatch[2]?.toLowerCase(),
      status: "handoff",
    };
  }

  return {};
}
