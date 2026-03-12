import { Type } from "@sinclair/typebox";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { appendProjectLogLine, formatLogLine } from "../state/project-log";
import { appendDecisionDoc, syncWorkflowFiles } from "../state/workflow-files";
import type { OrchestratorState, TeamConfig } from "../state/types";

const DecisionLogParams = Type.Object({
  title: Type.String(),
  decision: Type.String(),
  rationale: Type.Optional(Type.String()),
  impact: Type.Optional(Type.String()),
});

export function registerDecisionLogTool(
  pi: ExtensionAPI,
  getState: () => OrchestratorState,
  getTeams: () => TeamConfig[],
  persistState: () => void,
  updateIndicator: (ctx: ExtensionContext) => void,
) {
  pi.registerTool({
    name: "team_decision_log",
    label: "Team Decision Log",
    description: "Append an approved decision entry to the active project decision log",
    parameters: DecisionLogParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const state = getState();
      const project = state.activeProjectId ? state.projects[state.activeProjectId] : undefined;
      if (!project) {
        return { content: [{ type: "text", text: "No active project" }] };
      }

      const timestamp = new Date().toISOString();
      const id = `decision-${Date.now()}`;
      project.decisions.push({
        id,
        title: params.title,
        decision: params.decision,
        rationale: params.rationale,
        impact: params.impact,
        timestamp,
      });

      appendProjectLogLine(
        project.cwd,
        formatLogLine(
          timestamp,
          "decision",
          `${params.title}: ${params.decision}${params.rationale ? ` | why: ${params.rationale}` : ""}${params.impact ? ` | impact: ${params.impact}` : ""}`,
        ),
      );

      appendDecisionDoc(project, project.decisions.at(-1)!);
      const team = getTeams().find((candidate) => candidate.id === project.boundTeamId);
      syncWorkflowFiles(project, team);

      persistState();
      updateIndicator(ctx);

      return {
        content: [
          {
            type: "text",
            text: `Recorded decision ${id}: ${params.title}`,
          },
        ],
      };
    },
  });
}
