# Agent Cold Start (Model-Agnostic)

## Two-repo layout (chosen)
- **Private (canonical)**: full product repo (`v2/`, migrations, scripts, etc.). All development happens here.
- **Public (cold start only)**: a **separate** repository that contains **only** a mirror of this `agent/` directory (same filenames and `agent/` paths), for model onboarding without exposing application code.

**Share with a new model**: give the **public** repo URL and ask it to read in the order below. Do **not** rely on “public subdirectory” inside a private repo (GitHub does not support that).

**Suggested public repo name**: `management-study-agent` (under your GitHub user/org). After you create it, set the mirror URL here for humans:

- Public agent mirror: `https://github.com/Suli-Hu/management-study-agent` *(edit if your slug differs)*

**Sync rule**: whenever you change any file under `agent/` in the private repo, copy the same tree to the public repo (preserve `agent/README.md`, `agent/PLAYBOOK.md`, etc.). A one-way manual sync is enough to start; optional later: GitHub Action on push.

> **Read order (required)**:
> 1) `agent/PLAYBOOK.md` — how to work (Plan → Execute → Verify → Learn)
> 2) `agent/PRODUCT_HANDBOOK.md` — **product positioning + feature map** (read before UI/spec work — designers & PM)
> 3) `agent/PROJECT.md` — engineering facts + product model (what/where/how)
> 4) `agent/design/README.md` — **design PRD index** + link to live design-system page  
>    - Filling the design-system foundation brief: `agent/design/DESIGN-DOC-BRIEF-FOR-PRODUCT.md`
> 5) `agent/API.md` — HTTP API checklist (Base URL, auth, discipline **key**, list/create endpoints, curl) — **read before any programmatic writes**
> 6) `agent/TEACHER.md` — teacher-agent rules + learning workflow + pedagogy notes
> 7) `agent/FRONTEND_WORKFLOW.md` — local server + HTML demo workflow for UI changes

## Repo map (one glance)
- `v2/` — **the only live product** (Astro + TS + Cloudflare Pages + D1)
- `archive/v1/` — legacy snapshot (read-only historical reference)
- `.claude-memory/` — legacy memory source (optional; do not depend on it)

## Hard rules (always)
- **No secrets in git**: tokens/passwords/keys/PII must never be written into this repo.
- **Minimize blast radius**: smallest change that achieves the goal.
- **Verify before done**: provide evidence (tests/commands/files).

