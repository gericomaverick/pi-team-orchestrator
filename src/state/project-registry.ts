import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export interface ProjectCandidate {
  id: string;
  name: string;
  cwd: string;
}

export function getProjectsRoot(): string {
  return path.join(os.homedir(), ".pi", "projects");
}

export function listProjectCandidates(projectsRoot = getProjectsRoot()): ProjectCandidate[] {
  if (!fs.existsSync(projectsRoot)) return [];

  return fs
    .readdirSync(projectsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({
      id: entry.name,
      name: entry.name,
      cwd: path.join(projectsRoot, entry.name),
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function resolveProjectPath(projectId: string, projectsRoot = getProjectsRoot()): string {
  return path.join(projectsRoot, projectId);
}

export function validateProjectId(projectId: string): string | undefined {
  const value = projectId.trim();
  if (!value) return "Project id cannot be empty.";
  if (value === "." || value === "..") return "Project id cannot be '.' or '..'.";
  if (value.includes("/") || value.includes("\\")) return "Project id cannot contain path separators.";
  return undefined;
}

export function ensureProjectDirectory(projectId: string, projectsRoot = getProjectsRoot()): { cwd: string; created: boolean } {
  fs.mkdirSync(projectsRoot, { recursive: true });

  const cwd = resolveProjectPath(projectId, projectsRoot);
  if (fs.existsSync(cwd)) {
    if (!fs.statSync(cwd).isDirectory()) {
      throw new Error(`Project path exists but is not a directory: ${cwd}`);
    }
    return { cwd, created: false };
  }

  fs.mkdirSync(cwd, { recursive: true });
  return { cwd, created: true };
}
