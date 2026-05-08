# Agent Cold Start (Model-Agnostic)

> **Read order (required)**:
> 1) `agent/PLAYBOOK.md` — how to work (Plan → Execute → Verify → Learn)
> 2) `agent/PROJECT.md` — engineering facts + product model (what/where/how)
> 3) `agent/TEACHER.md` — teacher-agent rules + learning workflow + API notes

## Repo map (one glance)
- `v2/` — **the only live product** (Astro + TS + Cloudflare Pages + D1)
- `archive/v1/` — legacy snapshot (read-only historical reference)
- `.claude-memory/` — legacy memory source (optional; do not depend on it)

## Hard rules (always)
- **No secrets in git**: tokens/passwords/keys/PII must never be written into this repo.
- **Minimize blast radius**: smallest change that achieves the goal.
- **Verify before done**: provide evidence (tests/commands/files).

