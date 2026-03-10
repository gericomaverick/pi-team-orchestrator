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
