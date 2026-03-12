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
  const body = stripFrontmatter(raw);
  const sections = parseSections(body);

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
    mission: firstParagraph(sections["mission"]),
    inputsRequired: toBulletList(sections["inputs required"]),
    outputContract: toOrderedList(sections["output contract"]),
    doneCriteria: toBulletList(sections["done criteria"]),
    prompt: firstParagraph(sections["prompt"]),
    alwaysReadDocIds: splitList(frontmatter.alwaysReadDocs),
    optionalReadKinds: splitList(frontmatter.optionalReadKinds) as RoleConfig["optionalReadKinds"],
    allowedWriteKinds: splitList(frontmatter.allowedWriteKinds) as RoleConfig["allowedWriteKinds"],
    sourcePath: rolePath,
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

function stripFrontmatter(raw: string): string {
  if (!raw.startsWith("---")) return raw;
  const end = raw.indexOf("\n---\n", 4);
  return end === -1 ? raw : raw.slice(end + 5);
}

function parseSections(raw: string): Record<string, string> {
  const lines = raw.split(/\r?\n/);
  const sections: Record<string, string[]> = {};
  let current = "_";
  sections[current] = [];

  for (const line of lines) {
    const match = line.match(/^##\s+(.+)$/);
    if (match) {
      current = match[1]!.trim().toLowerCase();
      sections[current] = [];
      continue;
    }
    sections[current]!.push(line);
  }

  return Object.fromEntries(
    Object.entries(sections).map(([key, value]) => [key, value.join("\n").trim()]),
  );
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

function firstParagraph(value?: string): string | undefined {
  if (!value) return undefined;
  const paragraph = value
    .split(/\r?\n\r?\n/)
    .map((chunk) => chunk.trim())
    .find(Boolean);
  return paragraph?.replace(/\s+/g, " ").trim();
}

function toBulletList(value?: string): string[] {
  if (!value) return [];
  return value
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*[-*]\s+/, "").trim())
    .filter(Boolean);
}

function toOrderedList(value?: string): string[] {
  if (!value) return [];
  return value
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*\d+\.\s+/, "").trim())
    .filter(Boolean);
}
