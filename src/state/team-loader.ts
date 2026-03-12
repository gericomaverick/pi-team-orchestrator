import fs from "node:fs";
import path from "node:path";
import { loadRoleFile } from "./role-markdown";
import type { RoleConfig, TeamConfig } from "./types";

const PHASE_ORDER = ["scout", "planning", "design", "architecture", "implementation", "review", "release"];
const DEFAULT_REQUIRED_DOCS: Record<string, string[]> = {
  scout: ["project-brief", "workflow-status"],
  planner: ["project-brief", "decision-log", "workflow-status"],
  architect: ["project-brief", "decision-log", "workflow-status"],
  coder: ["project-brief", "decision-log", "workflow-status"],
  "mpe-coder": ["project-brief", "decision-log", "workflow-status", "active-blockers"],
  "build-engineer": ["project-brief", "workflow-status", "active-blockers"],
  reviewer: ["project-brief", "decision-log", "workflow-status", "active-blockers"],
  "continuity-steward": ["project-brief", "decision-log", "workflow-status", "active-blockers"],
  documentor: ["project-brief", "decision-log", "workflow-status"],
  "release-manager": ["project-brief", "decision-log", "workflow-status", "active-blockers"],
  "product-owner": ["project-brief", "decision-log", "workflow-status", "active-blockers"],
  "technical-director": ["project-brief", "decision-log", "workflow-status", "active-blockers"],
  "systems-designer": ["project-brief", "decision-log", "workflow-status"],
  "combat-designer": ["project-brief", "decision-log", "workflow-status"],
  "world-atmosphere-designer": ["project-brief", "decision-log", "workflow-status"],
  "world-level-designer": ["project-brief", "decision-log", "workflow-status"],
  "multiplayer-persistence-engineer": ["project-brief", "decision-log", "workflow-status", "active-blockers"],
  "qa-balance-analyst": ["project-brief", "decision-log", "workflow-status", "active-blockers"],
};
const TEAM_ID_ALIASES: Record<string, string> = {
  "wep-app": "web-app",
};

export interface TeamLoadResult {
  teams: TeamConfig[];
  warnings: string[];
  teamsRoot: string;
}

interface TeamManifestRoleSpec {
  id: string;
  source?: string;
  overrides?: Partial<Pick<RoleConfig, "name" | "phase" | "model" | "thinking" | "deliverables" | "handoffTo">>;
}

interface TeamManifest {
  id?: string;
  name?: string;
  description?: string;
  roles: Array<string | TeamManifestRoleSpec>;
  defaultPhase?: string;
  policyMode?: TeamConfig["policyMode"];
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

    const manifestPath = path.join(teamsRoot, sourceTeamId, "team.json");
    const rolesDir = path.join(teamsRoot, sourceTeamId, "roles");
    const sharedRolesRoot = resolveSharedRolesRoot(teamsRoot);
    const parsedRoles = fs.existsSync(manifestPath)
      ? loadRolesFromManifest(manifestPath, sharedRolesRoot, warnings, teamId)
      : loadRolesFromDirectory(rolesDir, warnings, sourceTeamId);

    if (!parsedRoles.length) continue;
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
    const manifest = fs.existsSync(manifestPath) ? readTeamManifest(manifestPath, warnings, teamId) : undefined;
    const defaultPhase = manifest?.defaultPhase ?? (phases.includes("planning") ? "planning" : phases[0]);

    teams.push({
      id: teamId,
      name: manifest?.name ?? humanizeTeamName(teamId),
      description:
        manifest?.description ??
        (fs.existsSync(manifestPath)
          ? `Loaded from ${path.relative(process.cwd(), manifestPath)}`
          : `Loaded from ${path.relative(process.cwd(), path.join(teamsRoot, sourceTeamId, "roles"))}`),
      roles,
      phases,
      defaultPhase,
      handoffRules,
      requiredDocsByRole: Object.fromEntries(
        roles.map((role) => [role.id, DEFAULT_REQUIRED_DOCS[role.id] ?? ["project-brief", "workflow-status"]]),
      ),
      policyMode: manifest?.policyMode ?? "standard",
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

function loadRolesFromDirectory(rolesDir: string, warnings: string[], sourceTeamId: string) {
  if (!fs.existsSync(rolesDir)) {
    warnings.push(`Skipping team '${sourceTeamId}': missing roles directory (${rolesDir})`);
    return [];
  }

  const roleFiles = fs
    .readdirSync(rolesDir)
    .filter((name) => name.endsWith(".md"))
    .map((name) => path.join(rolesDir, name))
    .sort();

  if (!roleFiles.length) {
    warnings.push(`Skipping team '${sourceTeamId}': no role markdown files found`);
    return [];
  }

  return roleFiles.map((file) => loadRoleFile(file));
}

function loadRolesFromManifest(manifestPath: string, sharedRolesRoot: string, warnings: string[], teamId: string) {
  const manifest = readTeamManifest(manifestPath, warnings, teamId);
  if (!manifest?.roles?.length) {
    warnings.push(`Skipping team '${teamId}': manifest has no roles (${manifestPath})`);
    return [];
  }

  return manifest.roles
    .map((roleSpec) => {
      const normalized = normalizeRoleSpec(roleSpec);
      const sourcePath = resolveRoleSource(normalized, manifestPath, sharedRolesRoot);
      if (!fs.existsSync(sourcePath)) {
        warnings.push(`Team '${teamId}' references missing role source '${sourcePath}'`);
        return undefined;
      }

      const parsed = loadRoleFile(sourcePath);
      const role = applyRoleOverrides(parsed.role, normalized.overrides);
      const handoffTargets = normalizeHandoffTargets(role.handoffTo);
      return {
        role,
        sourcePath,
        handoffTargets,
      };
    })
    .filter(Boolean) as ReturnType<typeof loadRoleFile>[];
}

function readTeamManifest(manifestPath: string, warnings: string[], teamId: string): TeamManifest | undefined {
  try {
    const parsed = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as TeamManifest;
    if (!Array.isArray(parsed.roles)) {
      warnings.push(`Team '${teamId}' manifest is missing a 'roles' array (${manifestPath})`);
      return undefined;
    }
    return parsed;
  } catch (error) {
    warnings.push(`Failed to read team manifest '${manifestPath}': ${(error as Error).message}`);
    return undefined;
  }
}

function normalizeRoleSpec(roleSpec: string | TeamManifestRoleSpec): TeamManifestRoleSpec {
  if (typeof roleSpec === "string") return { id: normalizeRef(roleSpec) };
  return {
    id: normalizeRef(roleSpec.id),
    source: roleSpec.source,
    overrides: roleSpec.overrides,
  };
}

function resolveSharedRolesRoot(teamsRoot: string) {
  return path.resolve(teamsRoot, "..", "roles");
}

function resolveRoleSource(roleSpec: TeamManifestRoleSpec, manifestPath: string, sharedRolesRoot: string) {
  if (roleSpec.source) {
    return path.isAbsolute(roleSpec.source)
      ? roleSpec.source
      : path.resolve(path.dirname(manifestPath), roleSpec.source);
  }
  return path.join(sharedRolesRoot, `${roleSpec.id}.md`);
}

function applyRoleOverrides(role: RoleConfig, overrides?: TeamManifestRoleSpec["overrides"]): RoleConfig {
  if (!overrides) return role;
  return {
    ...role,
    ...overrides,
    deliverables: overrides.deliverables ? [...overrides.deliverables] : role.deliverables,
    handoffTo: overrides.handoffTo ?? role.handoffTo,
  };
}

function normalizeHandoffTargets(handoffTo?: string | string[]) {
  if (!handoffTo) return [];
  return Array.isArray(handoffTo) ? handoffTo : [handoffTo];
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
