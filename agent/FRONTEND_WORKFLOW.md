# Frontend Workflow (Local Server + HTML Demo)

## Goal
For any frontend-visible change (layout, color, spacing, typography, interaction), the default acceptance method is:
**run a local server → show a reproducible demo page → validate on target viewports**.

## Default workflow
1) **Run local server**
- `pnpm -C v2 dev`
- Use the real browser for fastest iteration whenever possible.

2) **Create a minimal demo**
- Prefer a **small, purpose-built demo page** that reproduces the issue with the site’s real CSS/tokens.
- **Important**: this repo uses Tailwind via Astro build; raw `v2/public/*.html` won’t be processed by Tailwind.
  - If you need Tailwind / site Layout / components, create an **Astro demo page** under `v2/src/pages/demo/` (recommended).
  - Keep it minimal and remove it after validation unless the user asks to keep it.

2.5) **Design quality gate (mandatory)**
- Before writing UI code, **deep-read and apply** the design skills:
  - `frontend-design` (aesthetic direction + cohesion + “no slop”)
  - `refactoring-ui` (hierarchy/spacing/color/depth systems)
  - `ui-typography` (typographic correctness, automatically enforced)
- Produce a quick “design intent” note (1–2 sentences) *inside your head* and keep the implementation consistent with it. Avoid random/patchy styling.
- Default quality bar: user is **detail-picky / perfectionist**. Do not ship “good enough” demos.

3) **Verify on required viewports**
- iPad Mini portrait: **744×1133**
- iPad Mini landscape: **1133×744**
- Also check a standard desktop size (e.g. 1280×800) when relevant.

4) **Evidence**
- Provide the demo URL (local path) and what to look for.
- Screenshots are optional; they do not replace the demo.

5) **Versioning (mandatory before push)**
- If the push contains any user-visible change (UI, copy, behavior, API contract), **bump `v2/package.json` version** first (at least patch).
- Commit version bump **in the same batch** as the functional change (or immediately after), then push.

## Guardrails
- Avoid “CSS whack-a-mole”: scan all related CSS/JS usage first, then change once.
- Safari/iOS differences are real: treat iPad validation as mandatory for UI-affecting changes.
- If demo is for discussion, make the **demo boundary obvious**: only the framed area should look like “the app”; outside should be a distinct “stage” background.
- Don’t rely on extra icons as a crutch. Prefer **native affordance**: hover/pressed/focus states + subtle elevation consistent with the site’s design language.
- Don’t make “conservative” trade-offs that reduce visual quality. Maintain **large iPad touch targets** *and* refined aesthetics (ghost/text actions, clear hierarchy, restrained shapes) unless the user explicitly asks to optimize for speed over polish.
- Avoid hover-only UX. Prefer click/tap + focus-visible; assume iPad-first interaction.

## When it’s not “a UI tweak” (product triage template)
If the request looks like spacing/color/layout but keeps expanding, pause and restate it as a **module design** problem. Use this checklist:

- **Define the module contract**: Primary job, Secondary info, Management actions, Editor entry.
- **Avoid dual-duty controls**: a single click target should not mean both “select” and “open details”.
- **Separate surfaces**:
  - **Selector surface** (e.g., chip row): selection only
  - **Management surface** (e.g., `⋯`): actions only
  - **Content surface** (e.g., description block): read-only info
  - **Editor surface**: a dedicated edit page/view
- **Deliverable**: 2–3 stable variants that all obey the same contract (don’t iterate random micro-interactions).

## Case study lessons (View header demo)
Use these as a checklist for future UI tasks.

### Demo presentation (communication is part of UX)
- Keep **demo UI clean**: no explanatory copy inside the demo frame.
- Prefer a **linear layout** for review: one demo block, then explanation below.
- Ensure the viewer can instantly tell “what is the app” vs “what is the stage”.

### Interaction fidelity (no “looks clickable” without behavior)
- If a demo claims “click to open”, it must actually work (open/close, click-outside, ESC).
- Don’t break interactions when refactoring layout: verify popover anchoring/positioning after DOM changes.

### Meaning alignment (use the product’s terms)
- Confirm critical nouns early (e.g., “编辑器” = “编辑视图页”, not an inline editor region).
- If terminology is ambiguous, update the demo to match the product’s existing semantics (menus, edit page entry).

### Don’t propose before checking
- Before suggesting “apply this pattern elsewhere”, **search the codebase** to confirm whether the pattern already exists on other pages.
- If it exists, align behavior/visual language intentionally; if it doesn’t, state the scope explicitly and why it’s safe to expand.

### Control semantics (avoid conflicts)
- Avoid **dual-duty controls**: selectors should select; actions should act; info should be content.
- Avoid “button on button” constructions (nested interactive targets). If you need two actions, make two adjacent targets with clear hit areas.

### Visual language & polish (perfectionist standard)
- Default bar is “detail-picky / perfectionist”: don’t accept “good enough”.
- Prefer calm shapes: tabs/links/ghost actions over heavy pill clusters when density feels uncomfortable.
- Maintain iPad hit targets without resorting to chunky pills; use spacing, padding, and subtle states instead.

