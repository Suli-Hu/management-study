# Project Facts (Engineering + Product)

## What this product is
**Anytime Study** is a multi-discipline study-notes platform.

Core content model (4 layers):
- **Theme (学派组)** → **School (学派)** → **Scholar (学者)** → **KP (知识点)**

## Source of truth
- **Code**: GitHub — **private** canonical repo (full tree: `v2/`, `agent/`, etc.)
- **Agent cold start (public)**: **separate** GitHub repo that mirrors **only** `agent/` for model onboarding (see `agent/README.md` → “Two-repo layout”). Product code stays private.
- **Data**: **D1 is the source of truth** (content is managed via API-first flows)
- `archive/v1/` is **legacy** and should be treated as read-only.

## Roles & permissions (high level)
- Treat authorization as **tenant/tenant_member** driven (owner/editor/viewer). Avoid reintroducing legacy RBAC tables/flows.
- Admin-only operations must remain behind explicit gates (do not “open up” write paths accidentally).

## Repo structure
- `v2/`: current product (Astro + TypeScript + Cloudflare Pages + D1)
- `v2/src/`: app code (pages, API routes, libs)
- `v2/public/docs/`: public-facing docs shipped with the site
- `v2/migrations/`: D1 schema migrations (schema only)
- `v2/scripts/`:
  - `ops/`: operational scripts (admin setup, D1 sync helpers)
  - `migrations/`: one-off data migrations
  - `dev/`: dev smoke tools
- `v2/tests/`: Vitest tests (regression + contract checks)

## Common commands (v2)
- Dev: `pnpm -C v2 dev`
- Typecheck: `pnpm -C v2 typecheck`
- Tests: `pnpm -C v2 test`
- Data validation: `pnpm -C v2 validate`

## Frontend workflow (required for UI changes)
- For any frontend-visible requirement: **run local dev server + provide an HTML demo** as the default acceptance artifact.
- See `agent/FRONTEND_WORKFLOW.md`.

## Operational gotchas (engineering)
- **D1 bind limit**: large `IN (?,?,...)` can fail around ~100 binds; prefer discipline-scoped queries or chunking.
- **Local D1 is per worktree**: new worktrees start with an empty local D1 unless migrations/data are applied.
- **Wrangler D1 import can be flaky**: rerun may succeed; don’t misdiagnose code without checking rerun behavior.
- **Safari/iOS layout differs**: treat iPad Mini viewport validation as mandatory for UI-affecting changes.

## Guardrails (engineering)
- Avoid dual-write/drift: prefer API-first + D1 truth; GitHub is for code.
- When moving paths: update references and verify with `typecheck` + `test`.

## Sources (legacy, optional)
- `.claude-memory/project_v2_product_model.md`
- `.claude-memory/project_v2_d1_gotchas.md`
- `.claude-memory/project_v2_admin_gate.md`
- `.claude-memory/feedback_frontend_methodology.md`

