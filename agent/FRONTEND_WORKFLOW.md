# Frontend Workflow (Local Server + HTML Demo)

## Goal
For any frontend-visible change (layout, color, spacing, typography, interaction), the default acceptance method is:
**run a local server → show a reproducible demo page → validate on target viewports**.

## Default workflow
1) **Run local server**
- `pnpm -C v2 dev`
- Use the real browser for fastest iteration whenever possible.

2) **Create a minimal demo**
- Prefer a **small, purpose-built HTML demo** that reproduces the issue with the site’s real CSS/tokens.
- Put temporary demos under `v2/public/` (e.g. `v2/public/demo_<topic>.html`) and remove them once the change is validated, unless the user asks to keep them.

3) **Verify on required viewports**
- iPad Mini portrait: **744×1133**
- iPad Mini landscape: **1133×744**
- Also check a standard desktop size (e.g. 1280×800) when relevant.

4) **Evidence**
- Provide the demo URL (local path) and what to look for.
- Screenshots are optional; they do not replace the demo.

## Guardrails
- Avoid “CSS whack-a-mole”: scan all related CSS/JS usage first, then change once.
- Safari/iOS differences are real: treat iPad validation as mandatory for UI-affecting changes.

