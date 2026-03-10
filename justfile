set shell := ["bash", "-cu"]

# Start pi with this extension
run:
  pi -e ./src/index.ts

# Project smoke check
smoke:
  npm run smoke

# New moonglow bootstrap (default game-dev)
moonglow-new team="game-dev":
  pi -e ./src/index.ts -p \
    "/messenger-mode blocked" \
    "/team-load {{team}}" \
    "/project-init moonglow --bind-active-team" \
    "/team-status" \
    "/project-status"

# Resume moonglow and inspect latest signed state
moonglow-resume team="game-dev":
  pi -e ./src/index.ts -p \
    "/messenger-mode blocked" \
    "/project-switch moonglow" \
    "/team-load {{team}}" \
    "/project-bind-team {{team}}" \
    "/checkpoint-log" \
    "/workflow-next" \
    "/agent-status" \
    "/handoff-log" \
    "/blockers"

# End-of-session signoff for moonglow with auto summary + resume card
moonglow-signoff-auto role="orchestrator" status="handoff" next="planner":
  pi -e ./src/index.ts -p \
    "/project-switch moonglow" \
    "/session-signoff --role {{role}} --status {{status}} --next {{next}}" \
    "/checkpoint-log"
