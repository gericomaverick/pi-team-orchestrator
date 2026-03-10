import fs from "node:fs";
import path from "node:path";
import { loadRoleFile } from "./role-markdown";
import type { TeamConfig } from "./types";

const PHASE_ORDER = ["scout", "planning", "design", "architecture", "implementation", "review", "release"];
const TEAM_ID_ALIASES: Record<string, string> = {
  "wep-app": "web-app",
};

export interface TeamLoadResult {
  teams: TeamConfig[];
  warnings: string[];
  teamsRoot: string;
}

export function loadTeamsFromMarkdown(teamsRoot: string): TeamLoadResult {
  const warnings: string[] = [];
  const teams: TeamConfig[] = [];

  if (!fs.existsSync(teamsRoot)) {
    warnings.push(`Teams root not found: ${teamsRoot}`);
    return { teams, warnings, teamsRoot };
  }

  const entries = fs.readdirSync(teamsRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory());

  for (const entry of entries) {
    const sourceTeamId = entry.name;
    const teamId = normalizeTeamId(sourceTeamId);
    if (teamId !== sourceTeamId) {
      warnings.push(`Normalized team id '${sourceTeamId}' -> '${teamId}'`);
    }

    const rolesDir = path.join(teamsRoot, sourceTeamId, "roles");
    if (!fs.existsSync(rolesDir)) {
      warnings.push(`Skipping team '${sourceTeamId}': missing roles directory (${rolesDir})`);
      continue;
    }

    const roleFiles = fs
      .readdirSync(rolesDir)
      .filter((name) => name.endsWith(".md"))
      .map((name) => path.join(rolesDir, name))
      .sort();

    if (!roleFiles.length) {
      warnings.push(`Skipping team '${sourceTeamId}': no role markdown files found`);
      continue;
    }

    const parsedRoles = roleFiles.map((file) => loadRoleFile(file));
    const roles = parsedRoles.map((parsed) => parsed.role);

    const roleRefMap = new Map<string, string>();
    for (const role of roles) {
      roleRefMap.set(normalizeRef(role.id), role.id);
      roleRefMap.set(normalizeRef(role.name), role.id);
    }

    const handoffRules: { from: string; to: string }[] = [];
    for (const parsed of parsedRoles) {
      for (const target of parsed.handoffTargets) {
        const toRoleId = roleRefMap.get(normalizeRef(target));
        if (!toRoleId) {
          warnings.push(
            `Team '${teamId}' role '${parsed.role.id}' references unknown handoff target '${target}' (${parsed.sourcePath})`,
          );
          continue;
        }
        handoffRules.push({ from: parsed.role.id, to: toRoleId });
      }
    }

    const phases = Array.from(new Set(roles.map((role) => role.phase))).sort(comparePhase);
    const defaultPhase = phases.includes("planning") ? "planning" : phases[0];

    teams.push({
      id: teamId,
      name: humanizeTeamName(teamId),
      description: `Loaded from ${path.relative(process.cwd(), path.join(teamsRoot, sourceTeamId, "roles"))}`,
      roles,
      phases,
      defaultPhase,
      handoffRules,
      requiredDocsByRole: {},
      policyMode: "standard",
    });
  }

  teams.sort((a, b) => a.id.localeCompare(b.id));
  return { teams, warnings, teamsRoot };
}

function comparePhase(a: string, b: string): number {
  const aIdx = PHASE_ORDER.indexOf(a);
  const bIdx = PHASE_ORDER.indexOf(b);
  if (aIdx === -1 && bIdx === -1) return a.localeCompare(b);
  if (aIdx === -1) return 1;
  if (bIdx === -1) return -1;
  return aIdx - bIdx;
}

function normalizeTeamId(raw: string): string {
  const normalized = raw.trim().toLowerCase();
  return TEAM_ID_ALIASES[normalized] ?? normalized;
}

function normalizeRef(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "-");
}

function humanizeTeamName(teamId: string): string {
  return teamId
    .split("-")
    .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
    .join(" ");
}
