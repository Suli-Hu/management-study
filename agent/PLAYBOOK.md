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

### Ship: PR → auto-merge → deploy

For any `v2/**` code change, follow this exact sequence — do not hand CI/CD details back to the user.

1. **Open PR** against `main` from a feature branch (`claude/<short-slug>`). Never push directly to `main` for `v2/**` changes.
2. **Queue auto-merge upfront**:
   ```bash
   gh pr merge <PR#> --squash --auto --delete-branch
   ```
   GitHub then waits for `v2-ci.yml` (PR-only check, ~60s) and squash-merges automatically when green.
3. **Skip polling CI manually**. Start watching the deploy workflow directly. Once the auto-merge fires `push:main`, `deploy-v2.yml` (path filter `v2/**`) starts immediately. Poll it with a background `until` loop on `gh run view <id> --json status,conclusion`; expect ~70–90s to `completed:success`.
4. **Verify on prod**. Smoke-test the changed surface (curl the route, hand the URL back for frontend eyeball). Never claim "shipped" without `completed:success` on `deploy-v2.yml` plus at least one verification check.
5. **Report**: PR #, main commit short SHA, deploy run id, prod verify outcome — one block, no narration.

#### Why `--auto` (not "poll CI then manually merge")

The CI on this repo is just `pnpm exec astro check` — identical to what local `pnpm -C v2 typecheck` already ran. Manually polling CI for 60s before merging adds wall-clock latency without catching anything the local check missed.

`--auto` lets GitHub gate on CI for you while you invest the same wait into polling the deploy. CI failure → GitHub holds the merge → you never see a deploy run → check the PR's CI log.

Deploy and CI are **independent workflows**: `deploy-v2.yml` (`push:main`) does **not** wait for `v2-ci.yml` (`pull_request`). They run in parallel timelines; don't conflate them in status reports.

#### When to skip the PR entirely

Direct push to `main` is allowed only for:
- `agent/**` / docs-only changes (no `v2/**` path → no CF deploy fires)
- Critical hotfix where prod is actively broken (still bump version, still verify after)

Never direct-push `v2/**` under normal conditions — lose PR audit trail + revert ergonomics.

#### Stop and ask the user when:

- CI red (need user direction: debug vs. ship anyway vs. roll back)
- Deploy fails (`conclusion: failure`) → don't auto-revert; surface logs first
- PR includes destructive / irreversible schema migration (drop column, rename table)
- User explicitly said "ask before merge" in this session

### Learn
- When a rule is clarified (by user feedback or a post-mortem), record it in the appropriate `agent/*.md` doc.
- Reduce recurrence: turn recurring pitfalls into checklists or guardrails.

## Evidence & integrity rules (short)
- **No invented specifics**: years, author names, paper titles, publisher names, or “A responded to B” causal chains.
- **Inference must be labeled**: “synthesis/inference” vs “source text”.
- **Uncertainty must be explicit**: “to be verified” beats guessing.


