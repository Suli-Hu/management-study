# PRD: school + scholar + theme editor v0.8 重写 (Stage 4.5)

> **状态**：v0 draft，PM 起稿，待用户 confirm。
>
> **谁该读**：Dev Eng（实施）+ Test Eng（验收）+ 用户（产品边界 + 视觉）
>
> **依赖**：Stage 4 KP editor v0.8 已 ship（[KP-EDITOR-V0.8-PRD.md](KP-EDITOR-V0.8-PRD.md)）；Dev Eng7 v0.8.7 strong-strip + sanitize 也 ship 后启动本 PRD。
>
> **工程量**：~3-5d（比 KP editor 8.5d 小，因为无 5 format 切换 + 无 evaluations + 字段数中等）

---

## 1. 背景与动机

KP editor v0.8 重写完，但 **school / scholar / discipline themes** editor 还是 v0.4.x 时代的 Astro server form：
- Tailwind class（`w-full px-3 py-2 rounded-md border text-sm`），不用 design system v1.0 token
- 视觉风格跟 KP editor 完全不一致（v0.8 墨黑 vs v0.4 默认蓝）
- 字段散布方式不一致（如 scholar 14 个字段没有 section 分组）
- 用户 v6 反馈："学派和学者的编辑器也按照知识点的样式更新一下，也是要明确字段"

→ **目标**：3 个 editor 全部按 KP editor v0.8 模式重写，design system + minimalism + 字段语义明确。

---

## 2. 范围

### 2.1 in scope

| Entity | new 页面 | edit 页面 |
|---|---|---|
| school | `/[discipline]/schools/new.astro` (153 行) | `/[discipline]/[school]/edit.astro` (226 行) |
| scholar | `/[discipline]/scholars/new.astro` (208 行) | `/[discipline]/scholars/[key]/edit.astro` (296 行) |
| theme (ThemeGroup) | `/[discipline]/themes/new.astro` (105 行) | `/[discipline]/themes/[key]/edit.astro` (182 行) |

**共 6 页面 / 1170 行代码**重写。

### 2.2 out of scope

- ❌ KP editor（Stage 4 已 ship）
- ❌ discipline 顶层 editor（`/admin/disciplines/*`）— 是 admin 后台收口工作，独立 PRD（D1 决策点）
- ❌ view editor（不存在 / 单独排期）
- ❌ realtime 预览
- ❌ autosave / draft

---

## 3. 决策点（**已 CONFIRMED 2026-05-04**）

7 决策点全 confirmed：

| # | 决策点 | **最终选择** | 备注 |
|---|---|---|---|
| D1 | discipline 顶层 editor 一并重写？ | **A 不重写**（独立 PRD） | scope 受控 |
| D2 | 实施模式 | **A 复用 v0.8 editor infrastructure**，每 entity 一 module + 共享 helpers | 不抽 generic framework |
| D3 | scholar 14 字段 layout | **A 分 4 section** | 基本 / 学术身份 / 生平 / 关联 |
| D4 | theme.schools[] 引用 | **α chip select autocomplete + 添加顺序固定** | Q6 minimalism 贯彻；当前 v0.4.x 没 drag，沿用 |
| D5 | scholar.tags 字段 | **A chip + `--tag-*` token 着色** | 与 KP/school tag 系统一致 |
| **D6** | school.concepts / scholar.kpsOrder 是否暴露输入字段？ | **B 不暴露**（**第 4 次 minimalism 贯彻**） | 用户决策：让自动派生 — KP editor 设 schools[] 自动写 kp_school 表；顺序按 kp_id 字典序。重复维护是冗余。同理 scholar.kpsOrder |
| D7 | new.astro 独立路由 | **A 是** | 与 KP editor D6 一致 |

**第 4 次 minimalism 贯彻**（D6=B）— PM 默认推 typeahead chip 是"小 affordance"，用户 reject "干啥用的没必要吧"。memory `feedback_minimalism_default.md` 已 capture pattern：
1. Q6（Stage 4）：上下箭头排序 reject
2. D2（Stage 4）：复制 zh 起手按钮 reject
3. 1C（Stage 4 v4）：ⓘ icon 全删 reject
4. **D6（Stage 4.5）：concepts/kpsOrder 不暴露 reject**

PRD 起草时 PM 默认推荐"做"被用户 reject 4 次 — 后续 PM 起草默认推 minimalism。

---

## 4. 用户路径

| # | 路径 | 入口 | 关键 step |
|---|---|---|---|
| U1 | 新建 school | `/[discipline]/schools/new` | 填 key/title/era/summary/theme/tags/concepts → 保存 |
| U2 | 编辑 school | `/[discipline]/[school]/edit` | GET prefill → 改字段 → 保存 |
| U3 | 新建 scholar | `/[discipline]/scholars/new` | 填 14+ 字段（4 section）→ 保存 |
| U4 | 编辑 scholar | `/[discipline]/scholars/[key]/edit` | GET prefill → 改字段 → 保存 |
| U5 | 新建 theme | `/[discipline]/themes/new` | 填 key/title/desc/tags/schools → 保存 |
| U6 | 编辑 theme | `/[discipline]/themes/[key]/edit` | GET prefill → 改字段 → 保存 |
| U7 | 错误处理 | 各 edit/new | 422 zod / 409 conflict / 500 → inline banner 不丢输入 |

---

## 5. 字段 spec

### 5.1 school

| 字段 | 类型 | 必填 | 输入控件 | 备注 |
|---|---|---|---|---|
| `key` | string regex `^[a-z][a-z0-9_]*$` | ✓ (new only) | text input | edit 时 readonly |
| `title.zh` | string | ✓ | text input |  |
| `title.ja` | string | — | text input | 可空 |
| `title.en` | string | — | text input | 可空 |
| `era` | string | — | text input | 如 "1947–" |
| `summary.zh` | string | ✓ | textarea rows=8 | 学派概述 |
| `summary.ja` | string | — | textarea rows=6 | 可空 |
| `themeKey` | string | ✓ | select dropdown | 引用 discipline.themes[].key |
| `tags` | string[] | — | chip select | 引用 discipline.tags[].key，`--tag-*` 着色 |
| ~~`concepts`~~ | ~~KpId[]~~ | **D6=B 不暴露** | — | 自动从 KP.schools[] 反向派生（kp_school 表）+ 字典序排 |

### 5.2 scholar（4 section）

#### Section 基本信息
| 字段 | 类型 | 必填 | 控件 |
|---|---|---|---|
| `key` | string | ✓ (new) | text |
| `name.zh` | string | ✓ | text |
| `name.ja` | string | — | text |
| `name.en` | string | — | text |

#### Section 学术身份
| 字段 | 类型 | 必填 | 控件 |
|---|---|---|---|
| `schools` | string[] | — | chip select autocomplete |
| `schoolsExplicit` | boolean | — | checkbox |
| `contribution.zh` | string | ✓ | textarea rows=6 |
| `contribution.ja` | string | — | textarea rows=4 |
| `field` | string | — | text |
| `institution` | string | — | text |

#### Section 生平
| 字段 | 类型 | 必填 | 控件 |
|---|---|---|---|
| `lifespan` | string | — | text 如 "1908–1970" |
| `born` | string | — | text |
| `died` | string | — | text |
| `nationality` | string | — | text |
| `flag` | string | — | text emoji（如 🇩🇪 🇺🇸）maxlength=8 |
| `origin` | string | — | text |

#### Section 关联
| 字段 | 类型 | 必填 | 控件 |
|---|---|---|---|
| `tags` | string[] | — | chip select 同 school.tags |
| `nobel` | object \| null | — | 折叠区，含 year + detail |
| ~~`kpsOrder`~~ | ~~KpId[]~~ | **D6=B 不暴露** | — | 自动从 KP.scholars[] 反向派生 + 字典序 |

### 5.3 theme (ThemeGroup)

| 字段 | 类型 | 必填 | 控件 |
|---|---|---|---|
| `key` | string regex | ✓ (new) | text |
| `title.zh` | string | ✓ | text |
| `title.ja` | string | — | text |
| `title.en` | string | — | text |
| `desc.zh` | string | — | textarea rows=3 |
| `desc.ja` | string | — | textarea rows=3 |
| `tags` | string[] | — | chip select |
| `schools` | string[] | — | chip select autocomplete（按添加顺序） |

---

## 6. UX 设计

### 6.1 沿用 KP editor v0.8 模式

| 维度 | 方案（与 KP editor 一致） |
|---|---|
| 技术栈 | vanilla TS DOM helper（无 React/Vue/Tailwind） |
| 设计系统 | design system v1.0 token（墨黑主题），全 0 hex |
| Mobile | iPad Mini 322px baseline + padding scaling |
| Layout | 全断点单列 + section card 边框分隔 |
| Topbar | 仅"← 返回 + 保存（edit）/ 创建（new）"按钮，无丢弃 / 放弃 / sticky bottom |
| 删 ⓘ icon | ✅（与 KP editor 1C 决策一致）|
| 学派 / tag chip 着色 | 用 `--tag-*` token |
| 触屏 hit area | ≥ 44×44 px |
| transition | max 150ms |

### 6.2 layout 主结构（school 例）

```
┌─────────────────────────────────┐
│ ← 返回经营学              [保存]│ ← top bar
├─────────────────────────────────┤
│ ## 基本信息                     │
│ key      [_______]              │
│ title.zh [_____________________]│
│ title.ja [_____________________]│
│ title.en [_____________________]│
│ era      [_______]              │
├─────────────────────────────────┤
│ ## 内容                         │
│ summary.zh                      │
│ [textarea rows=8]               │
│ summary.ja                      │
│ [textarea rows=6]               │
├─────────────────────────────────┤
│ ## 关联                         │
│ themeKey   [select ▼]           │
│ tags       [chip] [chip] +      │
└─────────────────────────────────┘
（concepts 字段 D6=B 不暴露 — 自动派生）
```

### 6.3 scholar 4 section layout

```
┌─────────────────────────────────┐
│ ← 返回经营学              [保存]│
├─────────────────────────────────┤
│ ## 基本信息                     │
│ key + name (3 lang)             │
├─────────────────────────────────┤
│ ## 学术身份                     │
│ schools chip + contribution     │
│ + field + institution           │
├─────────────────────────────────┤
│ ## 生平（可选）                 │
│ lifespan / born / died /        │
│ nationality / flag / origin     │
├─────────────────────────────────┤
│ ## 关联                         │
│ tags + nobel + kpsOrder         │
└─────────────────────────────────┘
```

### 6.4 minimalism 贯彻（继承用户偏好）

- 不要 inline `<strong>` 自动加粗（v0.8.7 已 sanitize）
- 不要 ⓘ icon
- 不要"复制 zh 起手"按钮（与 D2=B 一致）
- 不要 drag reorder
- 不要 realtime preview
- 必填星号 `*` 保留
- placeholder 保留 C 类
- section 内 hint 短、不重复必填星号已表达的内容

### 6.5 错误处理（与 KP editor §4.1 一致）

422 zod / 409 conflict / 500 / network → inline banner 显示 reason + 不丢用户输入。

---

## 7. 工程拆解

### 7.1 文件改动

**重写**（删旧实现）：
- `v2/src/pages/[discipline]/schools/new.astro`（153→~80 server-side shell）
- `v2/src/pages/[discipline]/[school]/edit.astro`（226→~80）
- `v2/src/pages/[discipline]/scholars/new.astro`（208→~80）
- `v2/src/pages/[discipline]/scholars/[key]/edit.astro`（296→~80）
- `v2/src/pages/[discipline]/themes/new.astro`（105→~80）
- `v2/src/pages/[discipline]/themes/[key]/edit.astro`（182→~80）

**新建**（vanilla TS DOM module）：
- `v2/src/lib/editor/school-state.ts` / `school-form.ts` / `school-api.ts`
- `v2/src/lib/editor/scholar-state.ts` / `scholar-form.ts` / `scholar-api.ts`
- `v2/src/lib/editor/theme-state.ts` / `theme-form.ts` / `theme-api.ts`
- ~~`typeahead-chip.ts`~~（D6=B 后不需要新建 — schools/scholars chip 复用 KP editor 现有 chip select）

**复用现有**（不动）：
- `v2/src/lib/editor/dom-helpers.ts`（input/textarea/btn/chip/dialog）
- `v2/src/lib/editor/api.ts`（错误分类）
- `v2/src/styles/kp-edit.css`（全 design system 已 token化）
- `v2/src/styles/tokens.css`（design system v1.0）

### 7.2 共享 CSS scope

CSS scope 改成 `<body class="entity-editor-v08">` 或保留 `kp-editor-v08` 作 scope name（实际是 v0.8 editor 通用样式）。

PM 推荐：rename CSS scope `.kp-editor-v08` → `.editor-v08` (with backward-compat alias)，让 school/scholar/theme 也用同一 scope。

### 7.3 共享 sanitize （v0.8.7 已 ship）

school / scholar / theme 写入路径也已经接入 deepStripStrong（Dev Eng7 v0.8.7 brief 涵盖）。本 PRD 不重做。

### 7.4 测试 spec

**单元测试**（vitest + jsdom）：
- 每 entity state.ts shape + dirty/save 状态机 (~6 case × 3)
- 每 entity form.ts render + serialize → entity zod parse 正确 (~5 case × 3)
- 每 entity api.ts 错误分类 (~3 case × 3)
- typeahead-chip.ts 共享 helper (~5 case)

**E2E**（playwright，对 staging 跑）：
- U1-U6 happy path 各 1 case
- U7 错误路径 3 case
- iPad Mini 322px viewport 各 entity 1 case

**视觉 / a11y**：
- token swap grep 0 hex
- D2/Q6 grep 0 复制 / 0 排序按钮
- a11y keyboard 全 form 可达

### 7.5 工程量估算

| 子项 | 估时 |
|---|---|
| 复用 KP editor module pattern + dom-helpers | 0.25d |
| school editor (3 page module) | 0.75d (D6=B 省 concepts 字段) |
| scholar editor (4 section, 14 字段) | 1.25d (D6=B 省 kpsOrder) |
| theme editor (5 字段) | 0.5d |
| ~~typeahead-chip helper~~ | **0d** (D6=B 不需要) |
| edit.astro / new.astro 6 页面 server shell | 0.5d |
| 单元测试 ~50 case | 0.75d |
| E2E ~10 case | 0.5d |
| 视觉 QA + token swap verify | 0.25d |
| **总** | **~4.75d**（D6=B 省 0.5d） |

---

## 8. 风险与缓解

| 风险 | 概率 | 影响 | 缓解 |
|---|---|---|---|
| scholar 14 字段单页太长 | 中 | 中 | 4 section 分组 + section card 边框（D3=A） |
| typeahead-chip 实施复杂 | 中 | 中 | 借鉴 KP editor schools chip + autocomplete pattern |
| theme.schools[] 没排序导致首页学派卡片顺序乱 | 低 | 中 | chip 添加顺序就是渲染顺序；明确文案"按添加顺序" |
| nobel 字段折叠区状态管理 | 低 | 低 | 简单 details/summary HTML element |
| edit / new astro 页面共用 shell 难度 | 低 | 低 | 与 KP editor v0.8 同 pattern，state.ts 区分 'new'/'edit' mode |

---

## 9. 上线 checklist

- [ ] D1-D7 决策点用户 confirm
- [ ] 6 页面 + 3 entity module + 1 typeahead-chip helper 实施
- [ ] 单元测试 ~50 case pass
- [ ] E2E ~10 case pass
- [ ] iPad Mini 322px viewport 视觉 QA
- [ ] token swap grep `0 hex` in 编辑器代码
- [ ] CSS scope rename / alias 不破现有 KP editor

---

## 10. 后续扩展（不在本 PRD scope）

- Discipline 顶层 editor（admin/disciplines）— D1=不重写，单独排期
- view editor（不存在 / 单独排期）
- 通用 editor framework 抽象（D2=B 备选，2-3 entity 够用 helpers，4+ 再考虑）

---

## 11. 实施约束

- ✅ 沿用 KP editor v0.8 同 pattern + design system v1.0
- ✅ minimalism 三贯彻（删 ⓘ / 不要复制按钮 / 不要排序）
- ✅ vanilla TS DOM
- ✅ 触屏 ≥ 44×44 px
- ❌ 不引入 framework
- ❌ 不动 backend schema（school-api / scholar-api / discipline schemas 不变）
- ❌ 不动 v0.8.0 KP body contract
