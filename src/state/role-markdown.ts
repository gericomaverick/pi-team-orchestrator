import fs from "node:fs";
import path from "node:path";
import type { RoleConfig } from "./types";

export interface ParsedRoleFile {
  role: RoleConfig;
  sourcePath: string;
  handoffTargets: string[];
}

export function loadRoleFile(rolePath: string): ParsedRoleFile {
  const raw = fs.readFileSync(rolePath, "utf8");
  const frontmatter = parseFrontmatter(raw);

  const roleId = (frontmatter.id ?? path.basename(rolePath, ".md")).trim();
  const roleName = (frontmatter.name ?? roleId).trim();
  const phase = (frontmatter.phase ?? "implementation").trim();

  const handoffTargets = splitList(frontmatter.handoffTo);

  const role: RoleConfig = {
    id: normalizeId(roleId),
    name: roleName,
    phase,
    model: frontmatter.model?.trim(),
    thinking: frontmatter.thinking?.trim(),
    deliverables: splitList(frontmatter.deliverables),
    handoffTo: handoffTargets.length <= 1 ? handoffTargets[0] : handoffTargets,
  };

  return {
    role,
    sourcePath: rolePath,
    handoffTargets,
  };
}

function parseFrontmatter(raw: string): Record<string, string> {
  if (!raw.startsWith("---")) return {};
  const lines = raw.split(/\r?\n/);
  if (lines[0]?.trim() !== "---") return {};

  const values: Record<string, string> = {};
  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.trim() === "---") break;
    if (!line.includes(":")) continue;
    const splitAt = line.indexOf(":");
    const key = line.slice(0, splitAt).trim();
    const value = line.slice(splitAt + 1).trim();
    values[key] = value;
  }
  return values;
}

function splitList(value?: string): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function normalizeId(input: string): string {
  return input.trim().toLowerCase().replace(/\s+/g, "-");
}
