# PRD: Stage 6 — 全站 design system v1.0 swap

> **状态**：v0 draft，PM 起稿，待用户 confirm。
>
> **谁该读**：Dev Eng（实施）+ Test Eng（验收）+ 用户（视觉决策）
>
> **依赖**：v0.8.x 重构系列已 ship（v0.8.10 收尾，2026-05-04）。Stage 6 是 D1=A 决策的遗留实施。
>
> **工程量**：~2-3d

---

## 1. 背景与动机

[theme-package v1.0 design system](../../../Desktop/exports%203/theme-package/tokens.css)（OKLCH 墨黑主题，3 层色彩架构 L1 / L2 / L3）当前**仅在 KP/school/scholar/theme 编辑器页面**接入（Stage 4-4.5 实施 with `<body class="kp-editor-v08">` scope）。

其他 v2 页面（详情页 / 学派页 / 学者页 / 主题首页 / discipline 首页 / admin 后台）仍用 v0.4.x Tailwind / 旧 CSS — 视觉风格断层：
- 编辑器是墨黑学术风
- 详情页是默认 Tailwind 蓝/灰
- admin 是更老的 CSS

用户 v6 反馈时已注明这是"D1=A 遗留"。Stage 6 = 应用 v1.0 token 到全站，统一视觉。

---

## 2. 范围

### 2.1 in scope

| 页面类型 | 文件 | 大致行数 |
|---|---|---|
| KP 详情页 | `[discipline]/kp/[id].astro` | ~400 行 |
| 学派详情页 | `[discipline]/[school]/index.astro` | ~600 行（v0.4.30 拖拽逻辑） |
| 学者详情页 | `[discipline]/scholars/[key]/index.astro` | ~500 行 |
| 主题首页 | `[discipline]/index.astro`（discipline 首页） | ~300 行 |
| 学派列表 | `[discipline]/schools/index.astro` | ~200 行 |
| 学者列表 | `[discipline]/scholars/index.astro` | ~200 行 |
| KP 列表 | `[discipline]/kp/index.astro` | ~200 行 |
| 主题列表 | `[discipline]/themes/index.astro` | ~150 行 |
| Discipline 选择首页 | `index.astro` | ~150 行 |
| Layout shell | `layouts/Layout.astro` | header / footer |
| 学习日志相关页 | `[discipline]/learning/*.astro` | 待评估 |

**共 ~10 页面 + Layout + 共享组件**。

### 2.2 out of scope（不在本 PRD）

- ❌ admin 后台 (`admin/disciplines/*` / `admin/users/*` / `admin/tokens/*`)— 独立 PRD（admin scope 跟用户主流程隔离）
- ❌ 编辑器（已接入 v1.0）
- ❌ 重构 layout 结构（只 swap CSS token，不改 HTML / 不改交互）
- ❌ Dark mode 实施（v1.0 token 含 `[data-mode="dark"]` 但 toggle UI deferred）
- ❌ 改 layout breakpoint / mobile 策略（保持现有，token 只换颜色）

---

## 3. 决策点（待用户最终 confirm）

| # | 决策点 | PM 推荐 | 备选 |
|---|---|---|---|
| **D1** | 一次性全站 swap vs 分页面渐进 | **分页面渐进**（每页面独立 PR，可单独 review/rollback） | 一次性大 PR（merge 风险高） |
| **D2** | swap 顺序 | **从访问最频繁开始**：discipline 首页 → KP 详情页 → 学派详情页 → 学者详情页 → 列表页 → 学习日志 | 按代码量从小到大 / 字母序 |
| **D3** | 视觉 regression test | **playwright 截图 baseline**（每页 1280px + 322px 双截图，前后对比给用户审） | 手动 spot-check |
| **D4** | 拖拽 / 交互层 | **保留所有现有交互**（拖拽排序 / hover / focus 等）— 只改色彩 token | 顺便 polish 交互（scope creep） |
| **D5** | 改 dark mode toggle | **不做**（独立 PRD，工程量 +1-2d） | 顺手做 toggle UI |
| **D6** | tag 颜色（学派分类色 L3）应用范围 | **全站统一 `--tag-*` 系列**：学派 chip / 知识点点缀 / sparkline | 仅详情页用，列表页留灰 |

---

## 4. 用户路径

| # | 路径 | 视觉变化 |
|---|---|---|
| U1 | 进 discipline 首页 | 从 Tailwind 默认 → 墨黑学术 |
| U2 | 点学派卡片进详情页 | 同上 + 学派 tag 用 `--tag-*` 着色 |
| U3 | 点学者进详情页 | 同上 |
| U4 | 点 KP 进详情页（含 quad/compare/accordion 渲染）| 同上 + KP 内嵌结构跟编辑器视觉一致 |
| U5 | 列表页 / 主题页 | 同上 |
| U6 | 学习日志 / 段位 / 热力图 | 用 `--tier-*` + `--i-*` 强度色（v1.0 已设计） |

---

## 5. 实施技术栈

跟 v0.8.x 编辑器一致：
- **vanilla CSS / Astro** — 不引入 framework
- **OKLCH token 全替换** — 旧 hex/rgb 字面量 → `var(--bg)` / `var(--text)` 等
- **stylelint `color-no-hex`** — 全站 0 hex 字面量
- **3 层色彩纪律**（v1.0 IMPLEMENTATION.md §决策树）：
  - L1 主题色 `--primary` 仅用于焦点（active tab / 主按钮 / focus 环 / 链接 / 文字）
  - L2 语义色 `--s-success/danger/warning/info/locked` 仅按职责（toast / banner / 校验）+ `--i-*` 强度（热力图）+ `--p-*` 进度 + `--tier-*` 段位
  - L3 分类色 `--tag-*` 仅学派归属
  - 任何新组件需色彩前先问"它表达的是什么 — 焦点 / 语义维度 / 分类"再选层

---

## 6. UX / 视觉

### 6.1 设计语言（继承 v0.8 编辑器）

- 字号 / 字重 / 字体栈 / spacing scale 不变（已统一 4px grid）
- transition 150ms ease（v0.8 编辑器风格）
- border-radius 4 / 6 / 8 / 10 / 12 px scale

### 6.2 关键映射

| 元素 | 现有 (Tailwind/旧) | Stage 6 后 |
|---|---|---|
| 页面 bg | `bg-white` / `#fafafa` | `var(--bg)` (oklch 0.985 暖白纸) |
| 卡片 bg | `bg-white shadow` | `var(--bg-elev)` |
| 区块底 | `bg-gray-50` | `var(--bg-soft)` |
| 主文字 | `text-gray-900` / `#000` | `var(--text)` (oklch 0.20 墨黑) |
| 次文字 | `text-gray-600` | `var(--text-2)` |
| 边框 | `border-gray-200` | `var(--border)` |
| 主按钮 | `bg-blue-600 text-white` | `bg: var(--primary); color: var(--primary-fg)` (墨黑) |
| 链接 | `text-blue-600` | `var(--link)` (oklch 0.30 接近墨黑但稍亮) |
| 学派 tag | 灰阶或自定义 | `var(--tag-mgmt/mkt/soc/...)` 8 色 |
| 段位徽章 | 多色（C/B/A/S 9 色之类） | `var(--tier-c/b/a/s)` 4 色 + 文字 - + 承担亚档 |
| 热力图 | hardcoded 6 档绿色 | `var(--i-0~5)` (蓝色阶 6 档) |

### 6.2.1 跨 component 一致性约束 (v0.8.18 后强约束，v0.8.20 source 修)

> **触发记录**：v0.8.16 → v0.8.18 → v0.8.20 演化。v0.8.16 (chip 3) "split-pane 同 KP 内外色不一致" → v0.8.18 加 `accentVarFor` 统一来源 (但路径错把 `school.key` hash 到 8 OKLCH token，ignore 真实 hex)。v0.8.20 修 source 改用 `resolveAccentForSchool` (user-defined hex)。

#### 单一来源

凡承担"学派归属"信息维度的 accent，**统一**走 `resolveAccentForSchool(school, discipline)` (返回 user-defined hex like `#10B981`)。**不**走 `hashToTagToken()` (page-level；editor `mountChipPicker` 还在用，跟 page chrome 解耦)。

| 角色 | API | 落地 |
|---|---|---|
| 解析 | `resolveAccentForSchool(school, { tags })` (`v2/src/lib/resolve-accent.ts`) | school.tags[0] → discipline.tags[key].color → return hex (or 'var(--text-3)' fallback) |
| 父容器 | `<a class="school-card" style={\`--accent: ${hex}\`}>` | 子元素用 `oklch(from var(--accent) l c h / 0.18)` 派生色阶 |
| Page chrome strip | `<div class="kp-pane-accent-strip" style={\`background:${hex}\`}>` | 直接用 hex，不 cascade `--accent` 防干扰子元素 (lang-toggle 等 focus action) |
| body renderer | `renderStructuredBody({ body, accentHex: 'var(--text-3)' })` | page interior decoration → 中性，**不传** entity hex |

#### 同信息维度跨 component 必须同色

任何下面"同一行"内的元素，在同一页面渲染时**必须** computed accent 相等：

| 信息维度 | 元素 | 用什么 |
|---|---|---|
| **学派 page chrome** | 学派 detail 页右栏顶 strip · SchoolCard chip · 顶部 schools chip | resolveAccentForSchool 出的 hex |
| **学者 page chrome** | 学者 detail 页右栏顶 strip · 学者所属学派 chip 列表 | scholar.schools[0] → resolveAccentForSchool 出的 hex |
| **段位 / 强度 / 进度（学习日志）** | 段位徽章 · 段位 chip · 进度条 | 各自独立 token (`--tier-*` / `--i-*` / `--p-*`) |

E2E test (`v2/tests/e2e/visual-regression.spec.ts`) 抽 page chrome strip 的 computed background 比对学派 hex (e.g. personality `#10B981` → 绿)，断言 inline style 直接落地。

### 6.2.3 三层原则 (v0.8.20 user feedback 后定稿)

> **触发记录**：
> - v0.8.18 (chip 17 hotfix) → v0.8.19 全删 redundant 着色 → v0.8.20 (chip 19 hotfix) 复盘双错。
> - v0.8.19 砍过头：右栏顶 3px strip 是 page chrome 不是 redundant decoration，应保留。
> - chip 1 v0.8.12 起一直错：`hashToTagToken(school.key)` 把学派 hash 到 8 OKLCH token，**完全 ignore** `school.tags[0] → discipline.tags[].color` 真实 hex (e.g. personality `tags=['t_ejbdv3']` → `#10B981` 绿)。
> - **第 6 次** minimalism 贯彻 (memory `feedback_minimalism_default.md`)。

#### 三层判断

色彩选层判断公式：

> 此元素的色提供了 page chrome（URL / breadcrumb / h1）没提供的信息吗？
> - **否** → 用中性 `var(--text-3)`（page interior decoration）
> - **是** → 它表达什么？
>   - 学派归属（page chrome / cross-学派 区分）→ **学派色 hex**（`school.tags[0] → discipline.tags[].color`，直接用 hex，IMPLEMENTATION.md L3 "永不动" 例外）
>   - 用户主动操作 → **L1 `var(--primary)` 墨黑**

| 类型 | 例子 | 用 |
|---|---|---|
| **Page chrome accent** | 学派/学者 detail 页右栏顶 3px strip · SchoolCard chip · KP/scholar 详情页顶部 schools chip | **学派色 hex** (resolveAccentForSchool) |
| **Page interior decoration** | KP list dot · items numbering · cells 着色 · cols 编号 | **中性** `var(--text-3)` |
| **Focus / action UI** | lang-toggle · LangFab · Star toggle · Save button · 主 CTA | **L1** `var(--primary)` 墨黑 |

#### 关键：tag 色 source 是 user-defined hex，不强制 mapping 8 OKLCH token

`discipline.tags[].color` 是 admin 在 tags 编辑器里挑的 hex (e.g. `#10B981`)，**不**强制走 v1.0 8 OKLCH `--tag-*` token。直接用 hex 渲染合规 — IMPLEMENTATION.md §README "tag 色：永不动" L3 例外。

**实施**：
- 单一入口 `resolveAccentForSchool(school, discipline)` (`v2/src/lib/resolve-accent.ts`) — 解析 `school.tags[0] → discipline.tags[key].color` → return user-defined hex (or `'var(--text-3)'` fallback)
- 父容器 inline `style={`--accent: ${hex}`}`，CSS 用 `oklch(from var(--accent) l c h / 0.18)` 派生 soft / deep 色阶
- **不**走 `hashToTagToken()` (page-level；editor `mountChipPicker(colorize: 'schools')` 还在用，那是 admin 编辑期视觉，跟 page chrome 解耦)

#### 反例 (chip 1-18 历史 bug 复盘)

| 元素 | 旧错 | v0.8.20 修 |
|---|---|---|
| SchoolCard chip | `data-tag={hashToTagToken(school.key)}` (8 OKLCH 之一，跟 admin hex 漂移) | `style={`--accent: ${hex}`}` (resolveAccentForSchool 真实 hex) |
| 学者/KP detail 顶部 schools chip | 同上 | 同上 |
| 学派 detail 页右栏顶 3px strip | v0.8.19 全删 (砍过头) | 恢复 (page chrome accent) — `<div style={`background:${hex}`}>` |
| 学派 detail 页内部 KP list dot | v0.8.18 加 (redundant) | v0.8.19 删，v0.8.20 不加回 (page interior) |
| lang-toggle / LangFab | `var(--accent, var(--text-3))` (受父级 cascade 影响) | `var(--primary)` (focus action L1，hardcode 不受 cascade) |

#### 与 §6.2.1 跨 component 一致性的关系

§6.2.1 约束"如果用 tag 色，多 component 必须同源"；§6.2.3 是上一层 — "**先判断该不该用 tag 色**"。先过 §6.2.3 三层，确认用 tag 色再过 §6.2.1 单一来源 (现在统一是 `resolveAccentForSchool` 出的 hex，不再走 `hashToTagToken`)。

### 6.2.2 IMPLEMENTATION.md §Step 6 校对清单 (chip 7 + 后续 chip 必跑)

> 落地任意涉及色彩 (page chrome accent / `--tier-*` / `--i-*`) 的页面 / 组件后**必跑此清单**，对照 `Desktop/exports 3/theme-package/IMPLEMENTATION.md` §Step 6 + §决策树。
> **按 §6.2.3 三层原则筛选每个色彩用法**：先判断该不该用色 (page chrome / interior / focus action)，再判断用什么 (学派色 hex / 中性 / `var(--primary)`)。

每页面对照检查：

- [ ] **三层原则 (§6.2.3)**：每个 colored 元素能回答"它是 page chrome / page interior / focus action？"按层选色
  - page chrome → 学派色 hex (resolveAccentForSchool)
  - page interior → 中性 `var(--text-3)`
  - focus action → L1 `var(--primary)`
- [ ] 学派 chip / SchoolCard / 顶 strip 用 `resolveAccentForSchool` 出的 user-defined hex (不走 `hashToTagToken`)
- [ ] 热力图 6 档（`--i-0` 到 `--i-5`）颜色递进自然
- [ ] 段位徽章只有 4 色（`--tier-c/b/a/s`），文字承担亚档（`-` / `+`）
- [ ] 顶部 nav active tab 用 `--primary` 描边
- [ ] 主按钮（"+ 新建记录" / "+ 添加..."）用 `--primary` 填充
- [ ] lang-toggle / LangFab 用 `var(--primary)` (focus action，**不**走 `var(--accent)` cascade — 防父级 page chrome strip `--accent` 干扰)
- [ ] 切到 dark 模式 (`[data-mode="dark"]`) 后所有文字可读、tag 色 oklch from hex 计算后仍鲜艳
- [ ] **跨 component (§6.2.1)**：如果元素需要用 tag 色，split-pane / 列表卡 / 详情页同一信息维度的所有 accent 元素 computed `--accent` 同源 (现在统一 `resolveAccentForSchool` 出 hex)
- [ ] 任何新加 colored 元素先过 §6.2.3 三层 + 决策树，不直接拍 hex / 不新建变量
- [ ] stylelint `color-no-hex` 全站 0 violation (例外：`resolveAccentForSchool` 返回 user-defined hex 是数据，不是 CSS 字面量)
- [ ] 编辑器 `.kp-editor-v08` scope 仍生效，本 chip 改动不破编辑器

### 6.3 dark mode token 已就绪

v1.0 tokens.css 含 `[data-mode="dark"]` 自动反相。Stage 6 实施时**保留 token 但不接 toggle UI**（D5=A）。下次想做 dark toggle 加个 `<button>` 切 `<html data-mode>` 即可。

---

## 7. 工程拆解

### 7.1 顺序（D2 推荐）

| # | 页面 | 估时 | 备注 |
|---|---|---|---|
| 1 | discipline 首页 + Layout shell | 0.5d | 全站 header/footer 共用 — 影响最广 |
| 2 | KP 详情页 | 0.5d | 含 5 format render + evaluations panel |
| 3 | 学派详情页 | 0.5d | 含拖拽排序 KP 列表 |
| 4 | 学者详情页 | 0.25d | 简单 |
| 5 | 学派 / 学者 / KP / 主题列表页 (4 个) | 0.5d | 卡片网格 |
| 6 | 学习日志 / 段位 / 热力图 | 0.25d | 用 `--tier-*` + `--i-*` |
| 7 | 视觉 regression test (playwright 截图) | 0.5d | 每页 1280 + 322 双截图 |

**总计 ~3d**。

### 7.2 文件改动

每页面：
- `[xxx].astro` 内嵌 `<style>` 把 hex 替换 token / Tailwind class 替换为 token-based class
- 共享 component（`KpCard.astro` / `SchoolCard.astro` 等）— 一次改影响多处
- `layouts/Layout.astro` — header / nav / footer

新建：
- `v2/src/styles/tokens-global.css`（如果还没有 — Stage 4 编辑器有 token import 但限编辑器 scope；Stage 6 把它 hoist 到全站 layout）
- `v2/playwright-screenshots/baseline/` — visual regression baseline

### 7.3 测试

- **Visual regression**（playwright）：每页 desktop 1280 + iPad Mini 322 双截图，跟 baseline 对比
- **stylelint** 加 `color-no-hex` rule 全站
- **a11y**：保持现有 keyboard / focus 行为不破

---

## 8. 风险与缓解

| 风险 | 概率 | 影响 | 缓解 |
|---|---|---|---|
| 视觉 regression — 用户书签深 link 视觉变 | 高 | 中 | 每页 PR 单独 ship，用户可分阶段适应；保留 OG 图片不变 |
| Tailwind class 残留 — 新旧 token 混用 | 中 | 中 | stylelint `color-no-hex` 全站拦；grep verify |
| 学派 8 个 `--tag-*` 不够（>8 个学派分类）| 低 | 低 | 现有 50 学派已映射到 8 tag key，schema 已定 |
| 拖拽 / 交互层 CSS 改动破坏 hover/focus 行为 | 中 | 高 | E2E 跑现有交互 case；只改色，不改 transform/transition |
| Layout shell 改动影响所有页面（包括编辑器）| 中 | 高 | 编辑器自己有 `.kp-editor-v08` scope 应不受影响；但 nav/footer 改要测编辑器 |
| dark mode token 暴露但没 toggle — 用户偶发触发 `[data-mode="dark"]` 看到怪样 | 低 | 低 | localStorage 里没 toggle 永远不会触发；本 PRD scope 不暴露 |

---

## 9. 上线 checklist

- [ ] 6 个决策点用户 confirm
- [ ] 每页 swap 单独 PR + visual regression baseline 对比给用户审
- [ ] stylelint `color-no-hex` 全站 0 violation
- [ ] 编辑器风格不破（`.kp-editor-v08` scope 仍生效）
- [ ] 学派 tag 颜色对（8 学派 → 8 tag key 映射查 discipline.tags）
- [ ] 学习日志 `--tier-*` 段位徽章 + `--i-*` 热力图替换正确
- [ ] iPad Mini 322px 视觉 QA 全 10 页面
- [ ] dark mode token 不破（即使没 toggle，确认 CSS var fallback 正常）
- [ ] 老师 agent 通知（Stage 5 通知已发，Stage 6 不需要再通知）

---

## 10. 后续扩展（不在本 PRD）

- Dark mode toggle UI（独立 PRD，~1d）
- admin 后台 swap（独立 PRD，~1-2d）
- Layout shell 重构（导航重设计 — 大改，独立 PRD）
- 全站字体 polish（中/日双语 fallback 优化）

---

## 11. 实施约束

- ✅ 沿用 v0.8 编辑器 design system v1.0 token
- ✅ minimalism 贯彻（5 次 pattern 已 capture in memory）
- ✅ vanilla CSS + Astro
- ❌ 不引入 framework
- ❌ 不改 schema
- ❌ 不改 layout 结构（只 swap 色彩）
- ❌ 不破现有交互（拖拽 / hover）
