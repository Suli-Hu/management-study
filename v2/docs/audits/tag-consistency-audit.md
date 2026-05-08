# Tag Color Consistency Audit · v0.8.18

> 触发：用户 v9 反馈 "学派详情页 split-pane 同 KP 内外色不一致"。
>
> 范围：Stage 6 chip 2 / 3 / 4 / 6 + 共享组件 EmptyRight / LangFab / 共享 .optA-* CSS。
>
> 依据：[v1.0 IMPLEMENTATION.md §决策树 + §Step 6 校对清单](../../../Desktop/exports%203/theme-package/IMPLEMENTATION.md)、`v2/docs/STAGE-6-DESIGN-SYSTEM-SWAP-PRD.md`。

---

## 1. 根因

> "同一个学派里面同一个知识点的里外颜色竟然不一样" — 用户

Stage 6 落地时，"学派归属色" 在两套来源之间漂移：

| 路径 | 来源 | 落地位置 |
|---|---|---|
| `tagColor(entity, library)` → `#hex` | 用户在 `discipline.tags[].color` 里手填的 hex（v0.5.0 标签化遗产） | `accentHex` — 喂给 `renderStructuredBody` / `EmptyRight` / `LangFab` / `lang-toggle` 等 |
| `hashToTagToken(tagKey)` → `var(--tag-mgmt)` 等 | v1.0 设计系统 8 色 OKLCH 调色板（确定性 hash） | `accentVar` — 喂给 split-pane 左 `is-active::before` strip / 右栏顶 strip / 学派 chip / 学者 chip |

两套色系在视觉上 **接近但不同**（hex 多在 `#5cb85c` / `#3a93f0` 这种 sRGB 调色板；OKLCH `--tag-*` 经过设计 calibration 在 `oklch(0.75 0.12 145)` 等）。**同一个学派/学者/KP** 在 split-pane 左右、列表与详情页、chip 与 body 之间，因此呈现两种近似但不同的色阶 → 用户感知为"分裂"。

PM 起 Stage 6 PRD 时漏 reference IMPLEMENTATION.md §"分类色 / 学派 Tag 原则：永不动" — 没把"同一信息维度跨 component 必须同一 token" 明示在 §6.2 mapping 表里，于是 chip 2/3/4 各自独立搬迁，留下漂移。

---

## 2. Audit 表 — 修前 vs 修后

`✓` = 与本页其它 accent 元素 token 一致；`✗` = 漂移。

### 2.1 学派详情页 `[discipline]/[school]/index.astro` (chip 3)

| 元素 | 修前 token 来源 | 修后 token 来源 | 状态 |
|---|---|---|---|
| `.split` 容器 `--accent` | `accentVar` (--tag-*) | `accentVar` | ✓ |
| 左 KP list row（**inactive**）dot | 无 | `var(--accent)` (= accentVar) | ✓ 新增 |
| 左 KP list row（**active**）dot | 无 | `var(--accent)` (= accentVar, opacity 1) | ✓ 新增 |
| 左 `.optA-kp.is-active::before` strip | `var(--accent)` (= accentVar) | unchanged | ✓ |
| 右栏顶 3px strip | `accentVar` | unchanged | ✓ |
| 右栏 `lang-toggle` `--accent` | `accentVar` | unchanged | ✓ |
| 右栏 KP body items numbering / cells / quad | ✗ `accentHex` | `accentVar` | ✓ 修复 |
| 右栏 `EmptyRight` （空学派） | ✗ `accentHex` | `accentVar` | ✓ 修复 |
| `LangFab` mobile 悬浮球 | ✗ `accentHex` | `accentVar` | ✓ 修复 |
| 评价模块 6 字段 LHS | 中性 (`--primary-soft`) | unchanged | ✓ 该中性，非分类信息维度 |

### 2.2 KP 详情页 `[discipline]/kp/[id].astro` (chip 2)

| 元素 | 修前 token 来源 | 修后 token 来源 | 状态 |
|---|---|---|---|
| header (title / scholars / year) | 中性 (`--text` / `--text-2` / `--text-3`) | unchanged | ✓ 该中性 |
| `kp-school-chip` (per school) | `data-tag={hashToTagToken(s.key)}` | unchanged | ✓ — 每 chip 用各自学派 token |
| `lang-toggle` `--accent` | ✗ `accentHex` | `accentVar` (KP 自身 tags[0]) | ✓ 修复 |
| KP body items numbering / cells | ✗ `accentHex` | `accentVar` | ✓ 修复 |
| 评价模块 6 字段 | 中性 | unchanged | ✓ |
| `LangFab` | ✗ `accentHex` | `accentVar` | ✓ 修复 |

### 2.3 学者详情页 `[discipline]/scholars/[key]/index.astro` (chip 4)

| 元素 | 修前 token 来源 | 修后 token 来源 | 状态 |
|---|---|---|---|
| `.split` 容器 `--accent` | ✗ `accentHex` | `accentVar` (学者 tags[0]) | ✓ 修复 |
| 左 hero 区 (name / lifespan) | 中性 | unchanged | ✓ 该中性 |
| 左"所属学派" chips | 各自 `data-tag={s.tagToken}` (= hashToTagToken(school.tags[0])) | unchanged | ✓ — 每 chip 用各自学派 token |
| 左"关联知识" KP list row dot | 无 | `var(--accent)` | ✓ 新增（对齐 chip 3 pattern） |
| 左 `.optA-kp.is-active::before` strip | `var(--accent)` (= 学者 accentVar) | unchanged | ✓ |
| 右栏顶 3px strip | ✗ `accentHex` | `accentVar` | ✓ 修复 |
| 右栏 `lang-toggle` `--accent` | ✗ `accentHex` | `accentVar` | ✓ 修复 |
| 右栏 KP body items numbering | ✗ `accentHex` | `accentVar` | ✓ 修复 |
| 右栏 inline body (mobile expand) | ✗ `accentHex` | `accentVar` | ✓ 修复 |
| `EmptyRight` (无关联 KP) | ✗ `accentHex` | `accentVar` | ✓ 修复 |
| `LangFab` | ✗ `accentHex` | `accentVar` | ✓ 修复 |
| Star toggle 收藏色 | ✗ `accentHex` | `accentVar` (via define:vars) | ✓ 修复 |

### 2.4 学习日志 `[discipline]/study-log/index.astro` (chip 6)

| 元素 | token 来源 | 是否 "学派归属" 维度？ | 状态 |
|---|---|---|---|
| 段位徽章 (C/B/A/S) | `--tier-*` (4 色 + 文字承担亚档) | 否 — 段位是 progress 维度 | ✓ |
| 热力图 6 阶 | `--i-0`...`--i-5` | 否 — 强度密度维度 | ✓ |
| 段位说明 chip 弱底 | `oklch(from var(--tier-*) l c h / 0.10)` | 否 | ✓ |
| KP / 学派 sparkline | 中性灰（用户决策"第一版不要颜色"） | — | ✓ |

**结论**：chip 6 已正确遵循 IMPLEMENTATION.md §决策树（强度/进度/段位用 L2 语义色；不当 tag 色用），无修改需要。

### 2.5 共享组件

| 组件 | API（不变） | 内部 token 处理（不变） |
|---|---|---|
| `EmptyRight` | `accentHex: string` prop（命名 legacy，但接受 `var(--*)` 不挑剔） | inline `style="background:${accentHex}"` 等支持 var() ✓ |
| `LangFab` | `accentHex?: string` prop | inline `style="--fab-accent:${accentHex}"` 支持 var() ✓ |
| `renderStructuredBody({ body, accentHex })` | 不变 | inline `style="--accent:${accentHex}"` 支持 var() ✓ |
| `SchoolCard` | `tagToken: string` prop | 已是 token-only（chip 1 设计） ✓ |

**注**：组件 prop 名仍叫 `accentHex` (legacy)，但内部全是 `style="..--accent: ${val}.."`，CSS var 嵌套合法 (`--accent: var(--tag-mgmt)`)；后续可改名 `accent` 但本 hotfix 不做（避免动 schema/contract）。

---

## 3. 不在本 hotfix scope

- 编辑器 `.kp-editor-v08` scope（已用 token，未调用 tagColor）
- discipline 首页 `index.astro` (chip 1) — `SchoolCard` 已 token-only
- 列表页 (chip 5 还没 swap，下一阶段)
- admin 后台
- `tagColor` / `tagColors` 函数本体仍保留 — `discipline.tags[].color` 字段仍存在（编辑器用于 chip 库自定义颜色 hint），只是详情页 layout/body **不再消费**。
  > 长期：若 `discipline.tags[].color` 完全闲置，下一个独立 PRD 评估是否 schema 删字段（破坏性，工程量 +1d）。

---

## 4. 验证方式

- **跨 component 视觉一致性 test** (新增): `v2/tests/e2e/visual-regression.spec.ts` `tag-consistency` describe 块
  - 抽 split-pane 左 dot 计算色 + 右栏 body items numbering ::marker 计算色，断言相等
- **现有 visual regression baseline**: 5 chip 截图（chip 1-4 + chip 6）— 修后跑 `--update-snapshots` 重 baseline
- **手动 verify 路径** (用户回归):
  1. `/keiei/personality?kp=k364` — split-pane 同 KP 左 dot 跟右 body 内容色一致
  2. `/keiei/scholars/hackman` — 同 KP 左关联知识 dot 跟右 body 内容色一致
  3. `/keiei/kp/k140` — header lang-toggle 跟 body 内容色一致

---

## 5. 决策树自查 (IMPLEMENTATION.md §附)

每个修复点都按"它表达的是什么"过决策树：

| 元素 | 表达 | 分层 | token |
|---|---|---|---|
| KP list dot indicator | 这个 KP 属于哪个学派 / 学者 | L3 分类 | `--tag-*` ✓ |
| 右栏 KP body items numbering | 这块内容跟哪个学派一致 | L3 分类 | `--tag-*` ✓ |
| lang-toggle `--accent` | 当前焦点 + 学派色双重表达（已有约定）| L3 分类（按学派而非纯焦点）| `--tag-*` ✓ |
| EmptyRight icon / dot / cta border | 当前学派 / 学者的空态 | L3 分类 | `--tag-*` ✓ |
| LangFab 球面 | 学派 / 学者 accent | L3 分类 | `--tag-*` ✓ |
| 段位徽章 / 热力图 / 进度条 | 强度/进度/段位 | L2 语义 | `--tier-*` / `--i-*` / `--p-*` ✓（chip 6 已对） |
| header / 主文字 / 边框 / focus | 焦点 / 中性 | L1 主题 | `--text` / `--border` / `--primary` ✓ |
| 评价 6 字段 LHS bg | 中性结构信息 | 中性 (`--primary-soft`) ✓ |

无新建颜色 / 无走出决策树。
