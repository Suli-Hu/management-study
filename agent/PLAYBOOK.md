# Working Style (Playbook)

## Design philosophy (non-negotiable)
- **Simplicity first**: prefer the smallest change with the fewest moving parts.
- **Root-cause driven**: fix causes, not symptoms; avoid temporary hacks unless explicitly requested.
- **Minimal impact**: only touch what’s necessary; avoid drive-by refactors.
- **Truth first**: never fabricate facts; label inference; mark uncertainty explicitly.

## Workflow: Plan → Execute → Verify → Learn

### Plan
- Non-trivial tasks (3+ steps or any architectural decision) must start with a plan.
- Break work into verifiable sub-tasks; avoid “big bang” edits.
- If facts are missing, gather evidence first (repo search, read relevant files, run the right commands).
- If the approach drifts, stop and re-plan (do not push through).
- If you hit ≥2 unexpected blockers, pause and reconsider the path (avoid rabbit holes).

### Execute
- Prefer parallelism for independent investigation.
- Keep the main thread focused on integration and decision-making.
- Avoid introducing new abstractions unless the current structure forces it.
- Avoid “preview loops”: data checks via command-line/tools first; do visual verification once.
- For frontend-visible work, default to: **run local server → ship a minimal HTML demo → verify on target viewports**.

### Verify
- Never mark work “done” without evidence.
- Prefer repo-native checks (e.g. `pnpm -C v2 typecheck`, `pnpm -C v2 test`, `pnpm -C v2 validate` when relevant).
- When making claims, attach evidence: file paths, code snippets, or command output.
- For frontend changes, evidence should include the **demo page path/URL** (screenshots are optional).
- **D1 schema / migration PRs** (rename or `DROP COLUMN` on content tables such as `kp`): **globally search** the repo for the **old column names** (e.g. legacy `format`, `body_zh`) and update every SQL / store path; then **smoke-test** at least `GET /api/v1/index/<discipline>` **with a token** on an environment that has real rows (empty DB can hide bad SQL). A **500 + empty body** on that route often means **SQL error against stale column names**, not “no data”.

### Learn
- When a rule is clarified (by user feedback or a post-mortem), record it in the appropriate `agent/*.md` doc.
- Reduce recurrence: turn recurring pitfalls into checklists or guardrails.

## Evidence & integrity rules (short)
- **No invented specifics**: years, author names, paper titles, publisher names, or “A responded to B” causal chains.
- **Inference must be labeled**: “synthesis/inference” vs “source text”.
- **Uncertainty must be explicit**: “to be verified” beats guessing.


