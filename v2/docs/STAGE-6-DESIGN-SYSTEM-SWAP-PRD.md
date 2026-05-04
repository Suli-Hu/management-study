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

### 6.2.1 跨 component 一致性约束 (v0.8.18 hotfix 后强约束)

> **触发记录**：v0.8.16 (chip 3) ship 后用户 v9 反馈"学派详情页 split-pane 同 KP 内外色不一致"。根因：PM 起 Stage 6 PRD 时漏 reference IMPLEMENTATION.md §"分类色 / 学派 Tag" 永不动原则 — 没把"同一信息维度跨 component 必须同一 token" 明示在 §6.2 mapping 表里，于是各 chip 各自迁移时 `tagColor()`(用户 hex) 与 `hashToTagToken()`(v1.0 token) 两套色源在同一页面共存。

#### 单一 token 来源

凡承担"学派归属"信息维度的 accent，**统一**走 `accentVarFor(entity)` (return `var(--tag-*)` via hash)。**不**走 `tagColor()` 用户 hex 路径。

| 角色 | API | 落地 |
|---|---|---|
| 解析 | `accentVarFor({ tags }, fallback?)` (`v2/src/lib/tag-color.ts`) | 输入实体 (school/scholar/kp/theme) `.tags[]`，输出 `var(--tag-mgmt)` 等 CSS var 字符串 |
| 父容器 | `<div class="split" style={\`--accent:${accentVar}\`}>` | 子元素 inherit `var(--accent)` 即可 |
| body renderer | `renderStructuredBody({ body, accentHex: accentVar })` | param 名 `accentHex` 为 legacy（接受 var() 字符串），重命名 deferred |
| 共享组件 | `<EmptyRight accentHex={accentVar} />` / `<LangFab accentHex={accentVar} />` | 同上 |

#### 同信息维度跨 component 必须同色

任何下面"同一行"内的元素，在同一页面渲染时**必须** computed `--accent` 相等：

| 信息维度 | 元素 |
|---|---|
| **学派归属（一个学派的视图）** | split-pane 左 KP list dot · 左 active row strip · 右栏顶 strip · 右栏 lang-toggle · 右栏 body items numbering / cells / quad · EmptyRight · LangFab |
| **学者归属（一个学者的视图）** | 同上（学者层视图） |
| **KP 归属（一个 KP 的视图）** | header lang-toggle · body items numbering · LangFab |
| **段位 / 强度 / 进度（学习日志）** | 段位徽章 · 段位 chip · 进度条 (各自独立 token: `--tier-*` / `--i-*` / `--p-*`，**不**串到 `--tag-*`) |

E2E test (`v2/tests/e2e/visual-regression.spec.ts` `跨 component tag 色一致性` describe) 抽 computed `--accent` 比对断言，不依赖像素 diff，跨平台稳。

### 6.2.3 ⚠️ "若无必要勿增实体" — page chrome 上下文原则 (v0.8.19 user feedback 后补)

> **触发记录**：v0.8.18 (chip 17 hotfix) ship 后用户 v10 反馈"split-pane 左侧 KP list dot 是冗余 affordance"。引用奥卡姆剃刀。**第 6 次** minimalism 贯彻 (memory `feedback_minimalism_default.md`)。

v1.0 IMPLEMENTATION.md §决策树是 general guideline ("它在表达'属于哪个学派'吗？→ L3 var(--tag-*)")，但 **同一 page 内 page chrome / URL 已经表达过的"信息维度"，内部元素不应重复标识**。§6.2.1 跨 component 一致性约束在此约束之内适用。

**例**：

| 场景 | URL | page chrome | 内部元素 | 决策 |
|---|---|---|---|---|
| 学派 detail 页 | `/keiei/personality` | breadcrumb + h1 已表 personality | 内部所有 KP 都属此学派 | 用 tag 色 dot/strip/items numbering 标"学派归属" = redundant → **全部中性 (`var(--text-3)`)** |
| KP detail 页 | `/keiei/kp/k364` | breadcrumb + title 已表 KP | 5 format render 是 KP 自身结构，**不是**"学派归属"维度 | items numbering / lang-toggle / FAB → **中性** |
| 学者 detail 页 | `/keiei/scholars/hackman` | breadcrumb + name 已表学者 | 关联 KP 列表全属此学者 | dot / 顶 strip / body / star toggle → **中性** |

**保留 tag 色的场景**（page chrome 没有表达，确实需要 chip 区分）：

| 场景 | 为何不 redundant |
|---|---|
| Discipline 首页 SchoolCard chip | 多学派并列展示，用 tag 色才能扫一眼区分 |
| KP detail 页**顶部 schools chip** | 跨多学派 KP，chip 着色显示"它属于哪几个学派" |
| 学者 detail 页**所属学派 chip 列表** | 跨多学派学者，chip 着色显示"他在哪些学派活动" |

**判断公式**：

> 此元素的 tag 色提供了 page chrome 没提供的信息吗？
> - 是 → 用 tag 色 (按 §6.2.1 单一 token 来源)
> - 否 → 中性 (`var(--text-3)`)

**与 §6.2.1 跨 component 一致性的关系**：§6.2.1 约束"如果用 tag 色，多 component 必须同 token"；§6.2.3 是上一层 — "**先判断该不该用 tag 色**"。先过 §6.2.3，需要用色再过 §6.2.1。

### 6.2.2 IMPLEMENTATION.md §Step 6 校对清单 (chip 7 + 后续 chip 必跑)

> 落地任意涉及 `--tag-*` / `--tier-*` / `--i-*` 的页面 / 组件后**必跑此清单**，对照 `Desktop/exports 3/theme-package/IMPLEMENTATION.md` §Step 6 + §决策树。
> **mock 校对前先按 §6.2.3 page chrome 上下文原则筛选**：page chrome / URL 已表达过的"信息维度"，内部元素不应重复用 tag 色标识。先判断该不该用色，再判断用什么色。

每页面对照检查：

- [ ] **page chrome 测试 (§6.2.3)**：每个 colored 元素能回答"此色提供了 page chrome 没提供的信息吗？"否则中性
- [ ] 学派 tag 仍是 v1.0 8 色（`--tag-mgmt/mkt/soc/purple/pink/cyan/blue/orange`），未被吞或换源
- [ ] 热力图 6 档（`--i-0` 到 `--i-5`）颜色递进自然
- [ ] 段位徽章只有 4 色（`--tier-c/b/a/s`），文字承担亚档（`-` / `+`）
- [ ] 顶部 nav active tab 用 `--primary` 描边
- [ ] 主按钮（"+ 新建记录" / "+ 添加..."）用 `--primary` 填充
- [ ] 切到 dark 模式 (`[data-mode="dark"]`) 后所有文字可读、tag 仍鲜艳
- [ ] **跨 component (§6.2.1)**：如果元素需要用 tag 色，split-pane / 列表卡 / 详情页同一信息维度的所有 accent 元素 computed `--accent` 同源
- [ ] 任何新加 colored 元素先过决策树（焦点 / 语义维度 / 分类）+ §6.2.3 page chrome test，不直接拍 hex / 不新建变量
- [ ] stylelint `color-no-hex` 全站 0 violation
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
