# Design documentation (public mirror)

> **Purpose**: Give **designers** and **PM** offline-readable PRDs and editor/design notes before opening Figma or specs.  
> **Source**: Copied from the private product repo `v2/docs/` (canonical engineering history lives there).  
> **Live UI reference**: Component gallery and tokens mirror — **https://study.sususu.org/design-system** (no login required).

## Read order (design work)

1. **`../PRODUCT_HANDBOOK.md`** — product positioning, IA, feature map (read first).
2. **`../FRONTEND_WORKFLOW.md`** — how UI changes are prototyped and reviewed (HTML demo, iPad viewports).
3. **This folder** — deeper PRDs as needed for your task.

## Files in this folder

| File | Contents |
|------|----------|
| `DESIGN-DOC-BRIEF-FOR-PRODUCT.md` | **设计系统文档调研 brief**（产品填写清单）；研发已部分代填 token / chip 八问 / 语言规则。 |
| `tokens-snapshot.css` | 从 `v2/src/styles/tokens.css` 复制的颜色 token 快照，供 brief §2 引用。 |
| `STAGE-6-DESIGN-SYSTEM-SWAP-PRD.md` | Design system swap, tiers (L1 theme / L2 semantic / L3 tags), rollout notes. |
| `KP-EDITOR-V0.8-PRD.md` | KP editor (structured body, formats, evaluation fields) — **UI-heavy**. |
| `SCHOOL-SCHOLAR-THEME-EDITOR-V0.8-PRD.md` | School / scholar / theme editors, admin flows. |
| `EDITOR-DESIGN.md` | Early editor architecture notes (v0.4.x). **Some assumptions are outdated** (today **D1 is content SoT**; GitHub is code-only). Keep for historical interaction patterns; cross-check with `PRODUCT_HANDBOOK.md` for current truth. |

## Related URLs (production)

- API / field reference (long): https://study.sususu.org/docs/api-reference.md  
- KP authoring pedagogy: https://study.sususu.org/docs/kp-field-guide.md  

## Sync note

When PRDs change in the private repo under `v2/docs/`, maintainers should **re-copy** the corresponding files here (or automate). This public repo does not contain application source code.
