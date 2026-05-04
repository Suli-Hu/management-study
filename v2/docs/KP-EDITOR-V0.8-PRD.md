# PRD: KP 编辑器 v0.8 重写（Stage 4）

> **状态**：v0 draft，PM 起稿，待用户 confirm。**不要在 PM 之外的 session 用此 PRD 执行**。
>
> **谁该读**：Dev Eng（实施）+ Test Eng（验收 spec）+ 用户（产品边界 + 视觉）
>
> **依赖**：v0.8.0 已 ship（[KP-BODY-STRUCTURED-PRD.md](KP-BODY-STRUCTURED-PRD.md) Stage 0-3 完成）。本 PRD = 该重构 Stage 4，原估 5d，Q1=B 范围扩展到 8-10d。
>
> **配套设计稿**：`kp-editor-v0.8-design/` 高保真 HTML 原型（design subagent 产出，PM 整合时替换色板到 [theme-package/tokens.css](../../../Desktop/exports%203/theme-package/tokens.css) v1.0 design system）

---

## 1. 背景与动机

### 1.1 触发事件

v0.8.0 Stage 3 hard cut 后，**backend 是 KpV08 discriminated union**，但**前端 KP edit 页（`v2/src/pages/[discipline]/kp/[id]/edit.astro` + `body-editor-client.ts`）仍用旧 string body DSL + 顶层 format 字段**。后果：

- 编辑器构造的 PATCH payload 是旧 contract → 立刻被 `legacy_top_level_format` / `legacy_string_body` 422 拒
- 老师 agent 通过 API 直接写 KP 没问题（用 v0.8.0 contract），但**任何走 admin 浏览器编辑器的写入路径完全坏死**
- v0.7.35 m178 事件根因之一是编辑器 `changeFormat()` 用 `serialize → parse` lossy 转换 — Stage 4 必须根除

### 1.2 双重目标

1. **跟 v0.8.0 contract 对齐**：编辑器构造 payload 用 KpV08 shape，调 v0.8.0 endpoint
2. **打破 v0.4.x 旧约束**：[EDITOR-DESIGN.md](EDITOR-DESIGN.md) 当年决策"桌面 only / 移动端编辑不做"，跟当前用户主力 iPad Mini 322px 矛盾。Stage 4 = mobile-first

### 1.3 用户需求（明确表态）

> "iPad Mini 主力，UI 细节敏感"（[user_sulihu](memory) 备忘）
>
> "条目顺序固定，用户自己可以重新写吧（复制粘贴的话也不麻烦）"（Q6 拍板）
>
> "整个 KP edit 页全重做"（Q1=B 拍板）

→ **目标**：mobile-first 的 minimalist 编辑器，零拖拽 / 零 realtime preview / 零自定义复杂控件，按 Q5 lead carry-over 让 format 切换不丢用户已写内容。

---

## 2. 范围

### 2.1 in scope

- **整个 KP edit 页全重做**（Q1=B）：title / schools / scholars / tags / year / format / body / evaluations 所有字段
- **5 per-format form**：narrative / flat-list / accordion / compare / quad
- **format 切换 confirm dialog + lead carry-over**（Q5）：narrative.prose ↔ 其它 format 的 lead 互转
- **zh / ja tab 切换**（Q4）：UI 切到任一 tab 时，body + evaluations 跟着切
- **mobile-first**：iPad Mini 322px viewport 优先，desktop 1024px+ 渐进增强
- **F4 backend 修**：`classifyZodFailure` 默认归 `schema_invalid`（不是 `body_structure_invalid`）
- **F5 编辑器 + schema 强制 zh/ja format 同步**（Q7）：UI 不暴露分别选 format 能力 + zod refine `zh.format === ja.format`
- **采用 [theme-package v1.0 design system](../../../Desktop/exports%203/theme-package/tokens.css)**：3 层色彩架构（L1 主题色墨黑 / L2 语义色 / L3 学派 tag），全编辑器零硬编码 hex

### 2.2 out of scope（明确不做）

- ❌ school / scholar / discipline / view 编辑页（不动）
- ❌ realtime 预览（Q3）
- ❌ autosave / draft / 版本回滚 UI
- ❌ flat-list / accordion 条目排序控件（Q6 — 上下箭头 / drag-drop 都不做）
- ❌ 富文本编辑（textarea + 简单 input 即可）
- ❌ 编辑器 i18n（UI 文案中文，不做 ja/en UI）
- ❌ 引入 React / Vue / Tailwind / 任何前端 framework（Q2 — vanilla TS DOM）
- ❌ migration 0021 drop 旧列（那是 Stage 5）
- ❌ 全局色板 swap（其它页面继续用现有 v2 风格）— 本 PRD 仅编辑器页接入新 design system，全站 swap 单独排期

### 2.3 7 决策点（已 confirmed，不要 review）

| # | 决策 | 选择 | 详 § |
|---|---|---|---|
| Q1 | 重写范围 | **整个 KP edit 页全重做** | §2.1 |
| Q2 | 实施技术栈 | **vanilla TS DOM helper** | §6.4 |
| Q3 | realtime 预览 | **不做** | §6.5 |
| Q4 | 多语种切换 UX | **zh/ja tab 切换** | §6.6 |
| Q5 | 切 format 时 lead | **保留 carry-over** | §5.4 |
| Q6 | flat-list/accordion 条目排序 | **顺序固定，不要排序控件** | §6.7 |
| Q7 | F4/F5 deferred 是否一起解 | **都解** | §7.5 |

---

## 3. 用户路径（覆盖所有使用场景）

| # | 路径 | 入口 | 关键 step |
|---|---|---|---|
| **U1** | 新建 KP（最常见 — 老师产 KP 主流程的 admin 后续微调入口）| `/[discipline]/kp/new` | **新建页 = 编辑页 layout 完全一致**（用户反馈 — 不分两步）：所有 section（基本信息 + 关联 + 主体 + 评价）一页全显示 → 用户按需填 → 保存按钮在标题填好后 enable → 一次保存完成 |
| **U2** | 编辑现有 KP | `/[discipline]/kp/:id/edit` | GET 现有 KP → form 自动 prefill → 改字段 → 保存 |
| **U3** | 切 format（destructive）| 编辑中点 format selector | 选新 format → confirm dialog（"X 格式数据将清空，导语 lead 会保留"）→ body 重置为新 format empty + lead 转换 |
| **U4** | 多语种维护 | 编辑中切 tab | 已写 zh → 切 ja tab → ja 空时显示"添加 ja 翻译"占位 → 填 → 保存（zh / ja 都送） |
| **U5** | 字段语义查询 | 字段 label 旁的 ⓘ | 点 → 弹 popover 显示 1 句定义 + link 到 [kp-field-guide.md](../public/docs/kp-field-guide.md) 对应小节 |
| **U6** | 保存失败处理 | 点保存按钮 | 422 / version_conflict / network error 各自 inline 错误提示 + 不丢用户输入 |

---

## 4. 数据流 / 已有 API contract（v0.8.0 已 ship，不动）

编辑器只调下列 endpoint，**不新增 endpoint**（Q1=B 不引入新 backend 工程量）：

| Endpoint | 用途 | 编辑器调用时机 |
|---|---|---|
| `GET /api/kps/:id` | 拿现有 KP 完整 shape | U2 编辑页 server-side render 阶段 |
| `POST /api/kps?discipline=<key>` | 创建 KP | U1 保存 |
| `PATCH /api/kps/:id` | 编辑 KP | U2/U3/U4 保存 |
| `GET /api/kps/empty-body?format=<format>` | 切 format 起手模板 | U3 confirm 后 fetch 新 empty KpBody（reuse v0.8.0 ship 的 endpoint） |
| `GET /api/metadata?discipline=<key>` | 拿 schools/scholars/tags 字典 | U1/U2 编辑页 server-side render 阶段 |

**保存 payload shape**（详见 [migration-v0.8.md §3](../public/docs/migration-v0.8.md#3-5-format-写入示例before-vs-after)）：

```jsonc
{
  "id": "k_xxx",
  "title": { "zh": "...", "ja": "..." },
  "body": {
    "zh": { "format": "flat-list", "lead": "...", "items": [...] },
    "ja": { "format": "flat-list", "lead": "...", "items": [...] }  // 可选
  },
  "evaluations": {
    "zh": { "meaning": "", "limit": "", "example": "", "response": "", "application": "", "analogy": "" },
    "ja": { /* 同 */ }  // 可选
  },
  "schools": [...], "scholars": [...], "tags": [...], "year": "..."
}
```

**关键**：编辑器**不发顶层 `format`、不发 string body、不发 `evalContent`**（这些都是 v0.8.0 后被 422 拒的 legacy 形状）。

### 4.1 错误响应处理（U6）

按 [migration-v0.8.md §7](../public/docs/migration-v0.8.md#7-错误码表) 错误码表分类显示：

| HTTP | reason | 编辑器 UI 反应 |
|---|---|---|
| 422 | `legacy_*` | **不应发生**（编辑器自己构造 payload）→ 显示 "编辑器 bug，请反馈" + 完整 detail 写 console |
| 422 | `body_format_invalid` / `body_structure_invalid` / `schema_invalid` | inline 错误：定位字段 highlight + 弹 toast 显示 reason + detail.message |
| 409 | `version_conflict` | 显示 "KP 已被其它 session 更新" + 提供 "重载" 按钮（GET 最新 + reapply 用户改动） |
| 403 | `tenant_mismatch` / `forbidden_field` | 显示 "权限不足或字段禁止" + link to admin |
| 500 / network | — | "保存失败，请重试" + 不丢输入 |

---

## 5. 数据模型 / format 切换语义

### 5.1 编辑器内部 state shape

```ts
interface EditorState {
  // 元字段（不随 lang tab / format 变）
  id: string;
  discipline: string;
  schools: string[];          // 多选
  scholars: string[];          // 多选
  tags: string[];              // 多选
  year: string;
  // 双语字段（按 lang tab 切换显示）
  title: { zh: string; ja?: string; en?: string };
  body: { zh: KpBody; ja?: KpBody };
  evaluations: { zh?: KpEvaluationsLang; ja?: KpEvaluationsLang };
  // UI-only
  activeLang: 'zh' | 'ja';
  activeFormat: KpFormat;     // = body.zh.format（== body.ja.format 当 ja 存在时，由 Q7 强制）
  // 元
  isDirty: boolean;            // 有未保存改动
  saveStatus: 'idle' | 'saving' | 'saved' | 'error';
  errorDetail: { reason: string; message: string; field?: string } | null;
}
```

### 5.2 ja 单语种边界

- 加载 KP 时若 `body.ja` 不存在 → ja tab 显示空 form（用户直接填即可，**不提供"复制 zh 起手"按钮**，D2=B 用户决策 minimalism — 用户能自己复制粘贴 zh 内容）
- 保存时若 ja tab 内容全空 → 不发 `body.ja` / `evaluations.ja`（payload 里省略，避免存全空对象）
- evaluations 同 body 处理

### 5.3 Q7 — zh/ja format 强制同步（编辑器层）

切 format 时 **同时改 `body.zh.format` 和 `body.ja.format`**（如果 ja 存在）。具体策略：
- format selector 在 UI 上是**全局唯一**，不是 zh/ja 各一个
- 切到新 format → confirm → `body.zh` 重置为 emptyKpBody(newFormat) + lead carry-over；`body.ja` 同（如果存在）

backend 同时 zod refine 强制（防 API 直调老师 agent 写出不一致状态）：

```ts
// v2/src/schemas/kp-api.ts
const KpBodyBilingual = z.object({
  zh: KpBody,
  ja: KpBody.optional(),
}).refine(
  (b) => b.ja === undefined || b.zh.format === b.ja.format,
  { message: 'body.zh.format 和 body.ja.format 必须一致' }
);
```

### 5.4 Q5 — 切 format 时 lead 保留 carry-over

定义"lead-equivalent text"：
- `narrative.prose` ↔ `flat-list.lead` ↔ `accordion.lead` ↔ `compare.lead` ↔ `quad.lead`

切 format 时：
1. 抽出当前 format 的 lead-equivalent text（narrative 是 prose，其它是 lead）
2. 调 `GET /api/kps/empty-body?format=<new>` 拿新 format 模板
3. 把抽出的 text 灌入新 format 的 lead-equivalent 字段（narrative 是 prose，其它是 lead）
4. 其它结构（items / groups / cols / cells / yAxis / xAxis 等）按 empty-body 模板（空）

特殊：narrative.prose **可能含 HTML / 多段** → carry 到 lead 时直接放原文（lead 是 string，allow HTML）。反向：lead 通常是单句导语 → carry 到 narrative.prose 时直接放原文。

### 5.5 evaluations 不受 format 影响

evaluations 是顶层独立字段（v0.8.0 PRD §3.2.2），跟 format 无关。**format 切换不动 evaluations**（只清 body）。

---

## 6. UX / 视觉设计

### 6.1 设计基线

**3 个不可破原则**：
1. **mobile-first** — iPad Mini 322px viewport 是 baseline，所有 form 在这宽度下要可用
2. **minimalist** — 零拖拽、零自定义控件、零花哨动效（max transition: 150ms）
3. **触屏 hit area ≥ 44×44 px**（Apple HIG 标准）— 所有按钮、tab、删除 ✕、format 选择项

### 6.2 design system v1.0 接入

采用 [theme-package/tokens.css](../../../Desktop/exports%203/theme-package/tokens.css) 的 3 层色彩架构（OKLCH，明暗双模）：

| 编辑器元素 | token | 理由 |
|---|---|---|
| 页面 bg | `--bg` | 暖白纸感 |
| 卡片 / form section bg | `--bg-elev` | 浮层 |
| 输入框 / textarea bg | `--bg-soft` | 弱填充 |
| 输入框 / textarea border | `--border` | 主描边 |
| 主文字 | `--text` | 表单内容 |
| label / 次文字 | `--text-2` | 字段名 |
| placeholder / 弱文字 | `--text-3` | 提示 |
| **主按钮（保存）** | `bg: var(--primary); color: var(--primary-fg)` | 焦点指示 |
| **active tab（zh/ja）** | `border-bottom: 2px solid var(--primary)` | 焦点指示 |
| **focus 环** | `outline: 2px solid var(--focus); outline-offset: 2px` | 键盘可见 |
| 字段 inline help link | `color: var(--link)` | 行内链接 |
| 错误 banner | `bg: var(--s-danger-soft); border: 1px solid var(--s-danger)` | 状态色 |
| 成功 toast（"已保存"）| `bg: var(--s-success-soft); icon: var(--s-success)` | 状态色 |
| 学派 chip（schools 选择器）| `bg: oklch(from var(--tag-mgmt) l c h / 0.15); color: oklch(from var(--tag-mgmt) calc(l - 0.35) c h); border: 1px solid oklch(from var(--tag-mgmt) l c h / 0.4)` | 学派分类色 |

**禁止**：编辑器代码内**任何 hex / rgb 字面量**（包括 `#fff` / `black` / `transparent` 之类）。`stylelint` 加 `color-no-hex` 拦截。

### 6.3 layout 主结构（**已基于 design subagent prototype 调整**）

iPad Mini 322px **单列布局，全断点单列 + padding scaling**（design subagent §3 决策；非 desktop 双列 — 322px 双列不可用，无 scale path）：

```
┌─────────────────────────────────┐
│ ← 返回经营学              [保存]│ ← top bar — 仅返回链接 + 单个保存按钮
├─────────────────────────────────┤
│ ## 基本信息（不随 lang 切）     │
│ title.zh [_____________________]│  ← 中文标题（必填）
│ title.ja [_____________________]│  ← 日本语标题
│ title.en [_____________________]│  ← English title
│ year     [____]                 │
├─────────────────────────────────┤
│ ## 关联（不随 lang 切）         │
│ schools  [chip] [chip] [chip] + │  ← 必填 ≥1
│ scholars [chip] [chip] +        │
│ tags     [chip] [chip] +        │  ← v0.8 必含（之前 prototype S1 漏）
├─────────────────────────────────┤
│ ## 主体（format = X）       [切]│ ← format 切换在 section header
│ [zh] [ja]      [F5 同步 format] │ ← **lang tab 在 body section 内**
│ [per-format form]               │
├─────────────────────────────────┤
│ ## 评价（可选，跟 lang tab 切） │
│ 义 [_____________________]      │
│ 限 [_____________________]      │
│ 例 [_____________________]      │
│ 应 [_____________________]      │
│ 用 [_____________________]      │
│ 喻 [_____________________]      │
└─────────────────────────────────┘
（**无 sticky bottom**，无悬浮"放弃/保存"按钮）
```

**关键 layout 决策（来自 subagent §C/H + 用户 v1 反馈）**：
- **lang tab 放 body section 内部**（不全局），因 ZH/JA 切换只影响"主体"和"评价"，不影响"基本信息"和"关联"。语义边界清晰，避免用户误解"切 ja 后标题也变"
- **F5 同步 format 按钮跟 lang tab 同行右对齐**（小字按钮，仅在 zh/ja format 不一致时 enable，触发后弹 confirm 复用切 format 逻辑）
- **section 用有边框 card 分隔**（不用纯 margin），视觉层次清晰特别是 compare 多列嵌套时
- **section 间 gap 20px / section 内 padding 16px**（4px grid 对齐）
- **桌面 1024px+ 仅扩 padding，不改单列结构**（subagent §3 padding 0 16px → 32px）
- **新建页 layout = 编辑页 layout 完全一致**（用户反馈 v1）：S1 不分"先创建后填详情"两步，所有 section（含 evaluations + tags）一开始就显示，用户按需填，保存按钮在 title.zh 填好后 enable
- **top bar 仅 2 元素**（用户反馈 v1）：左 "← 返回 [discipline 名]" 链接 + 右单个 "保存" 按钮。**无"丢弃" / "放弃" / "创建" 等冗余按钮**（返回 = 隐式丢弃）
- **无 sticky bottom save area**（用户反馈 v1）：删除原 prototype 的 .kpe-save-area 浮动 bar，唯一保存入口在 top bar
- **title 字段 3 语种全显**（用户反馈 v1）：title.zh + title.ja + title.en 都在"基本信息" section 内常驻显示（v0.8 schema 含 ja，prototype v1 漏掉了 ja）

### 6.4 5 per-format form 详细 spec

每个 form 一个独立 module（`v2/src/lib/editor/forms/<format>.ts`），实现 `{ render(state, onChange) → HTMLElement; serialize() → KpBody }`。

#### 6.4.1 narrative

```
[ lead-equivalent: prose textarea, rows=12, full-width ]
```

字段：仅 `prose`（textarea）。无 lead，无 items。

#### 6.4.2 flat-list

```
lead     [textarea rows=2, full-width]

条目 #1  [name input  ] [✕]
         [desc textarea rows=2]
条目 #2  [name input  ] [✕]
         [desc textarea rows=2]
...
[ + 添加条目（block btn） ]
```

字段：`lead` / `items[].name` / `items[].desc`。条目按数组 index 顺序渲染，**无排序控件**（Q6）。

#### 6.4.3 accordion

```
lead     [textarea rows=2]

组 #1    [title input] [✕]
   item #1.1  [name] [✕]
              [desc textarea rows=2]
   item #1.2  [name] [✕]
              [desc textarea rows=2]
   [+ 组内添加条目]

[+ 添加组]
```

字段：`lead` / `groups[].title` / `groups[].items[].{name,desc}`。**两层嵌套数组**，但每层都"+ 添加 / ✕ 删除"模式，零排序。

#### 6.4.4 compare

```
lead     [textarea rows=2]

列 #1    [title]    [keyword]   [✕]
         desc       [textarea rows=2]
         type       [input]
         theories   [input]
         detail     [textarea rows=3]

列 #2    ...

[+ 添加列]   ← 当 cols.length === 4 时 disable + 提示"最多 4 列"
```

字段：`lead` / `cols[].{title, keyword, desc, type, theories, detail}`。每列 6 字段竖排在 mobile，desktop 可考虑横排表格。

**列数上限**（用户 v4 反馈 3）：
- **UI 上限：max 4 列**（"+ 添加列"按钮在 cols.length === 4 时 disable + tooltip "最多 4 列，更多对比拆成多个 KP"）
- **Schema 不动**（仍 `cols.min(2)` 无 max）— 兼容 v0.7.x 已有 cols >= 5 的存量数据 PATCH 写回
- 理由：322px iPad Mini 单列展示 / 1280px desktop 3-4 列舒适 / 5+ 列没法读。4 = 古典/行为/系统三大学派 + 1 备用 = 真实最大需求

#### 6.4.5 quad

```
lead     [textarea rows=2]

yAxis    [input  placeholder="低-敬业程度-高 / 优势-劣势"]
xAxis    [input  placeholder="新市场-旧市场 / 高-相对份额-低"]

╔══════════════════════════╗
║ 左上 (高y, 低x)           ║
║   name [input]            ║
║   emoji [input ⭐]         ║
║   sub [input]             ║
║   detail [textarea rows=2]║
╠══════════════════════════╣
║ 右上 (高y, 高x)           ║
║   ...                    ║
╠══════════════════════════╣
║ 左下 (低y, 低x)           ║
║   ...                    ║
╠══════════════════════════╣
║ 右下 (低y, 高x)           ║
║   ...                    ║
╚══════════════════════════╝
```

字段：`lead` / `yAxis` / `xAxis` / `cells[]` (固定 4 个，**位置不可调** — UI 上 4 个 cell 各自标注"左上/右上/左下/右下"+ 维度组合)。

**yAxis / xAxis schema 重构**（用户 v4 反馈 2 + v5 follow-up "明确字段不能搞兼容"）：

**v0.8.3 patch breaking change**：把 `yAxis: string` / `xAxis: string` 拆成 `QuadAxis` 对象（详见 [KP-BODY-STRUCTURED-PRD.md §3.1](KP-BODY-STRUCTURED-PRD.md#31-核心discriminated-union)）：

```ts
QuadAxis = { low: string, label: string, high: string }
// low / high 必填
// label 可空（空 = 两段用法 SWOT 风；非空 = 三段 BCG 风）
```

**UI 拆 3 个 input**（替代之前单 string input）：

```
Y 轴维度 *
[低值 *]  [中间维度（可空）]  [高值 *]
 例 "低"     例 "敬业程度"      例 "高"

X 轴维度 *
[新市场 *] [（可空）] [旧市场 *]   ← 中间空 = 两段用法
```

**填法**：
- 三段 BCG 风：`低-敬业程度-高` → `{low:'低', label:'敬业程度', high:'高'}`
- 两段 SWOT 风：`优势-劣势` → `{low:'优势', label:'', high:'劣势'}`

**Migration**（用户 Q2=A smart split）：
- 现有 prod quad KP（v0.7.x backfill 后是 string）→ admin endpoint backfill 跑 smart split
- 算法：按 `-` 或 `/` split string
  - 3 段 → `{low: parts[0], label: parts[1], high: parts[2]}`
  - 2 段 → `{low: parts[0], label: '', high: parts[1]}`
  - 0/1 段 → 标 dirty，PM 手动 review 修
- prod 现有 quad KP 约 6-10 个，可控

**渲染层**：render-body-structured.ts 重组 axis label：`{low}-{label}-{high}`（label 为空时 `{low}-{high}`）。详 §7.5。

> ⚠️ Q6 含义在 quad 这里更强：cells 数组**索引-位置映射固定**（PRD §3.1 4 cell 顺序"左上→右上→左下→右下"），用户不能 swap，只能在原位置改字段值。

### 6.5 format 切换 confirm dialog

用户点 "切" → 弹 native `<dialog>`（不用自定义 modal — Q2 minimalist + 触屏友好）：

```
┌─────────────────────────────────┐
│ 切换格式                        │
│                                 │
│ 当前格式 "flat-list" 的 5 条    │
│ 条目 + 内嵌内容将被清空。       │
│                                 │
│ 导语 lead 会保留为新格式的导语。│
│                                 │
│ 评价（义/限/例/应/用/喻）不受   │
│ 影响。                          │
│                                 │
│ 继续切换到 "accordion" 吗？     │
│                                 │
│       [取消]   [确认切换]       │
└─────────────────────────────────┘
```

新建 KP 第一次选 format（body 仍空）**不弹**（避免无意义 confirm）。

### 6.6 zh/ja tab 切换交互（**lang tab 在 body section 内部**）

按 §6.3 layout 决策 + design subagent §C：lang tab 不在全局顶部，而是**位于 body section 的 header 区**。点击切换后：
- body section 内的 form 显示对应语种内容
- evaluations section 内的 6 字段显示对应语种内容
- **title 不随切**（title.zh / title.ja / title.en 是独立小 input，永远全列在"基本信息" section）
- **关联区不随切**（schools / scholars / tags / year 是 KP 级字段，无语言区分）
- **F5 同步 format 按钮**与 lang tab 同行右对齐：仅在 zh.format != ja.format 时 enable，触发后弹切 format confirm dialog（复用 §6.5 逻辑），把另一语种 format 同步到当前

ja 单语种边界（§5.2）：
- 切到 ja tab + body.ja 不存在 → 直接显示空 form（用户自填）。**不做"复制 zh 起手"按钮**（D2=B 用户决策 minimalism）
- 用户填 ja 后 → 切回 zh ↔ ja 之间数据完整保留

### 6.7 字段 inline help（U5）— **已撤回（用户 v4 反馈 1C 决策）**

**原 PM 设计**：每个有歧义可能的字段 label 旁加 ⓘ icon → click 弹 popover + link 到 kp-field-guide.md。

**用户 v4 反馈 1C**：**全编辑器删 ⓘ icon**（一刀切 minimalism）— 用户能主动找 docs，不需要每个字段塞 ⓘ。这是用户**第三次贯彻 minimalism**（Q6 顺序固定 + D2 不要复制按钮 + 现在 ⓘ 全删），feedback_minimalism_default.md memory 已 capture pattern。

**最终方案**：编辑器内**零 ⓘ icon**。所有字段 label 不带 inline help link。用户需要字段语义查询时自行访问 `https://study.sususu.org/docs/kp-field-guide.md`。可在编辑器 footer / 帮助菜单挂一个统一 link"查看字段教学 →"（可选，不做也行）。

---

## 7. 工程拆解

### 7.1 文件改动 / 新建清单

**重写**（删旧实现）：
- `v2/src/pages/[discipline]/kp/[id]/edit.astro`（478 → ~200 行，server-side 仅 GET + render shell + hydrate client）
- `v2/src/pages/[discipline]/kp/new.astro`（如不存在则新建）
- `v2/src/lib/body-editor-client.ts`（588 行 → 删，拆成下面多个 module）
- `v2/src/styles/kp-edit.css`（843 行 → 删，重写成 token-based ~400 行）

**新建**（vanilla TS DOM API，每个 module 独立可测）：
- `v2/src/styles/tokens.css` — copy from [Desktop/exports 3/theme-package/tokens.css](../../../Desktop/exports%203/theme-package/tokens.css)，全局 inject
- `v2/src/lib/editor/state.ts` — EditorState shape + reducer-ish update helpers + dirty/save status tracking
- `v2/src/lib/editor/api.ts` — fetch wrapper for POST/PATCH/GET 5 endpoints + 错误分类（按 §4.1）
- `v2/src/lib/editor/dom-helpers.ts` — input / textarea / btn / chip / dialog 通用 helper（取代 body-editor-client.ts:126-160 但 token-based）
- `v2/src/lib/editor/format-switcher.ts` — Q5 lead carry-over + confirm dialog + GET empty-body 集成
- `v2/src/lib/editor/forms/narrative.ts` — narrative form module
- `v2/src/lib/editor/forms/flat-list.ts`
- `v2/src/lib/editor/forms/accordion.ts`
- `v2/src/lib/editor/forms/compare.ts`
- `v2/src/lib/editor/forms/quad.ts`
- `v2/src/lib/editor/eval-panel.ts` — evaluations 6 字段 panel module
- `v2/src/lib/editor/lang-tabs.ts` — zh/ja tab 切换 + 单语种占位
- `v2/src/lib/editor/relations-panel.ts` — schools/scholars/tags/year/title 输入区
- `v2/src/lib/editor/help-popover.ts` — ⓘ icon + popover

**backend 改动（F4 + F5）**：
- `v2/src/lib/kp-legacy-detector.ts` — `classifyZodFailure` 默认归 `schema_invalid`（path 触及 body 时归 `body_structure_invalid`）
- `v2/src/schemas/kp-api.ts` — `KpBodyBilingual` 加 `.refine` 强制 `zh.format === ja.format`
- 测试更新：`v2/tests/kps-v08-stage3-supplement.test.ts` 的 T8.7 / 类 11 forbidden_field 等需翻 reason expectation 从 `body_structure_invalid` → `schema_invalid`（如果它们 zod fail 在非 body path）

### 7.2 编辑器渲染流程

```
edit.astro (server-side, Astro)
  ├─ fetch KP via getKpRecord(db, id)（已有）
  ├─ fetch metadata via getMetadata(db, discipline)（已有）
  ├─ render shell HTML + script tag with EditorState init payload (JSON)
  └─ hydrate: import { initEditor } from '~/lib/editor/state.ts'
     └─ initEditor(rootEl, initialState, metadata)
        ├─ render relations-panel
        ├─ render title inputs
        ├─ render lang-tabs
        ├─ render format selector + active per-format form module
        ├─ render eval-panel
        ├─ wire 保存 button → api.savekp() → success/error 显示
        └─ wire format-switcher
```

### 7.3 测试 spec 概要（具体测试 case 由 Test session 详化）

**单元测试**（vitest，pure DOM happy path 用 jsdom）：
- 5 form module 各自：emptyState 渲染 / 改字段 → state 更新 / serialize() 输出符合 KpBody zod
- format-switcher：lead carry-over 5×4 = 20 个 transition 路径
- api.ts：5 endpoint mock + 错误分类（422 6 reason / 409 / 5xx）
- eval-panel：6 字段 → KpEvaluationsLang / 全空 → undefined（不送 ja）
- F4 backend test：non-body zod fail → reason='schema_invalid'
- F5 backend test：post `body.zh.format !== ja.format` → 422 detail 含 refine message

**E2E 测试**（playwright，对 staging 跑）：
- U1：新建 KP 5 format × {zh-only, zh+ja} = 10 case
- U2：编辑 5 format 各 1 个 KP，改 1 字段保存
- U3：5×4 = 20 个 format 切换 path（含 lead carry-over 视觉验证）
- U4：切 lang tab 不丢数据 / "复制 zh 起手" 按钮工作
- U6：故意触发 422 / 409 → UI 正确显示 + 不丢用户输入
- a11y：keyboard 全 form 可达 / focus 环可见 / aria-live 错误提示
- viewport：iPad Mini 322px / desktop 1280px 两个断点 happy path

### 7.4 工程量估算

| Stage 4 子项 | 估时 |
|---|---|
| design system v1.0 接入（tokens.css + 全编辑器 token 化）| 0.5d |
| dom-helpers.ts + state.ts + api.ts | 1d |
| 5 per-format form module | 1.5d |
| relations-panel + lang-tabs + eval-panel + help-popover | 1.5d |
| format-switcher + lead carry-over + confirm dialog | 0.5d |
| edit.astro + new.astro 改写 | 0.5d |
| F4 + F5 backend 修 + test 更新 | 0.5d |
| 单元测试（每 module 配 .test.ts）| 1.5d |
| E2E 测试（playwright case 设计 + 实施）| 1d |
| 视觉 QA（iPad Mini + desktop 跑各 format）| 0.5d |
| **总计** | **8.5d**（PRD 估 Q1=B 8-10d 区间） |

### 7.5 跟 v0.8.0 已 ship 内容的兼容

- 已有 `v2/src/pages/api/kps/empty-body.ts` 直接复用（GET endpoint）
- 已有 `v2/src/lib/kp-body-helpers.ts` 的 `emptyKpBody()` 直接 import 到 client（同构 helper）
- 已有 `v2/public/docs/migration-v0.8.md` 不动
- 已有 `v2/public/docs/kp-field-guide.md` 不动（编辑器只 link 进去）

---

## 8. 风险与缓解

| 风险 | 概率 | 影响 | 缓解 |
|---|---|---|---|
| vanilla TS DOM 写嵌套数组（accordion）代码量大 | 中 | 中 | 抽 dom-helpers.ts 封装 input/textarea/btn/chip/list pattern；module 之间隔离，单元可测 |
| iPad Mini 322px form 卡屏 | 中 | 高 | mobile-first CSS（非 responsive 翻转），所有断点先在 322px 跑通；E2E 跑 322px viewport |
| 切 format 时 evaluations 用户以为也清 | 低 | 低 | confirm dialog 文案明确"评价不受影响" |
| design system tokens.css 跟现有 v2 全站风格冲突（编辑器外其它页用旧风格）| 中 | 中 | tokens.css 限定 inject 到 `<body class="kp-editor-v08">` scope，全局 swap 留后续 PR |
| F5 zod refine 拒 历史 prod 数据（v0.7.x 写过 zh.format != ja.format 的 KP）| 低 | 高 | 部署前跑 `auditKpStructured` 加 mismatch 检查项 → 修存量；PRD 估算的 prod backfill 692/0 errors 但没单独验过 zh/ja format consistency |
| Q6 用户后悔（"复制粘贴重写太麻烦"） | 中 | 低 | 留 v0.8.x patch 加上下箭头排序按钮（cheap 加，不影响主架构） |
| design subagent 出品的 prototype 不 align design system（subagent 用 placeholder 色）| 高 | 低 | PM 整合时手动 swap；DESIGN.md 标注 token 使用清单 |

---

## 9. 上线 checklist（Stage 4 ship 前）

- [ ] 5 form module 各自的单元测试 pass
- [ ] format-switcher lead carry-over 20 个 path 测试 pass
- [ ] F4 + F5 backend 修 + 测试更新 pass
- [ ] E2E playwright 全套 pass（U1-U6 in §7.3）
- [ ] iPad Mini 322px viewport 视觉 QA 全 5 format 一遍（手工 + screenshot）
- [ ] `stylelint color-no-hex` 全编辑器代码 0 violation
- [ ] tokens.css 接入全局 layout，明暗双模切换正常
- [ ] prod audit 加 `body.zh.format != body.ja.format` 检查项，跑确认 0 mismatch
- [ ] 老师 agent 通知 deferred 到 Stage 5（详见 [v0.8-rollout-plan.md §3](v0.8-rollout-plan.md#3-stage-5-完成后通知老师-agent-template-留存)）— 本 PRD 不通知

---

## 10. 后续扩展（Stage 5 / 不在本 PRD scope）

> **遗留需求 from D1**：v0.8.x 全站 design system swap PR — Stage 4 ship 后排期。把 [theme-package v1.0 tokens.css](../../../Desktop/exports%203/theme-package/tokens.css) 应用到全站（详情页 / 学派页 / 学者页 / 首页 / admin 后台），打破"编辑页跟其它页视觉断层"。预估 +2-3d，含每个页面的视觉回归测试。Stage 5 之后 + 全站 swap 之前，编辑器跟其它页风格不一致是已知 trade-off。



- Stage 5 drop 旧列后，编辑器内 reverse-bridge helper（`structuredToLegacyDsl` 等）可删
- 全站接入 design system v1.0（school edit / scholar edit / 详情页等）— 本 PRD 仅编辑器
- Q6 反悔 → 加上下箭头排序（如果用户用一阵子真觉得麻烦）
- realtime preview（当年 PRD §12 已列入未来扩展）— 用户当前不要
- 编辑器内 KP body 历史 diff 查看
- 编辑器模板库（用户保存常用 flat-list / accordion 结构作模板）

---

## 11. 决策点（**已 CONFIRMED 2026-05-04**）

PRD 起稿时对齐 7 决策点（§2.3）；下列 6 个细节决定也已用户最终 confirm。**Stage 4 实施时不再 review**。

| # | 决策点 | **最终选择** | 备注 |
|---|---|---|---|
| D1 | tokens.css 接入 scope | **A 仅编辑器页**（`<body class="kp-editor-v08">`） | ⚠️ **遗留需求**：Stage 4 ship 后单独排期 v0.8.x 全站 design system swap PR（详见 §10 后续扩展） |
| D2 | "复制 zh 起手" 按钮（§5.2 / §6.6） | **B 不做** — 用户切 ja tab 直接看到空 form 自填，复制粘贴 zh 用户自己来 | 用户决策（minimalism 原则），**改 PM 推荐**。同模式见 Q6（条目顺序固定不要排序按钮） |
| D3 | ~~desktop 1024px+ 双列 layout~~ | **A 全断点单列 + padding scaling**（subagent prototype 实测决策） | 322px 双列不可用 |
| D4 | format selector 位置 | **A body section header**（"主体（format = X）[切]"） | 紧贴 body 视觉关联强 |
| D5 | F5 zod refine 在 schema 层强制 | **A 做**（schema-level 防 API 直调 bypass 编辑器） | 1 行 zod refine + 1 测试 case |
| D6 | new.astro 独立页面 | **A 是**（`/[discipline]/kp/new`） | URL 干净，不需 if-else 区分模式 |

**Q-extra**（PM 整合 prototype 时冒出的）：

| # | 问题 | 用户决策 |
|---|---|---|
| extra-1 | 是否要 PM swap prototype 蓝色 → 墨黑给你重审 | **不需要**（用户只关心 layout / interaction，视觉气质相信 PM 整合） |
| extra-2 | S3-S6 是否要补完整 layout（基本信息+关联+评价）跟 S2 对齐 | **不需要**（S3-S6 保持 body-only focused demo） |

---

## 12. 配套设计稿

`kp-editor-v0.8-design/`（design subagent 产出）— 见 [§13 Design Reference](#13-design-reference)。

PM 整合时把 prototype 里的硬编码色 → §6.2 的 design system token 映射表替换。

---

## 13. Design Reference

### 13.1 高保真原型位置

`/Users/husuli/Documents/Web Project/.claude/worktrees/agent-ab13e3418c792a494/kp-editor-v0.8-design/`

| 文件 | 用途 |
|---|---|
| `index.html` (67 KB) | 7 屏 stacked，浏览器直接打开看（`open kp-editor-v0.8-design/index.html`） |
| `styles.css` (31 KB) | 全部 CSS，prototype 自定义 token，Dev 实施时按 §13.4 swap |
| `DESIGN.md` (10 KB) | 完整设计说明（设计语言 / 关键决策 / mobile 适配 / 实施提示） |
| `README.md` | anchor 索引快查 |

**7 屏 anchor**：`#s1` 新建 / `#s2` narrative / `#s3` flat-list / `#s4` accordion / `#s5` compare / `#s6` quad / `#s7` 特殊态（7A-7G）

**S7 子状态详情**：
- 7A: ja 无内容占位（"添加 ja 翻译" + "复制 zh 起手"按钮）
- 7B: ja 已有内容
- 7C: format 切换 confirm dialog（inline 显示便于审；Dev 实施用 native `<dialog>`）
- 7D: 保存按钮三态（idle / loading / disabled）
- 7E: 三类错误（422 / 409 version_conflict / network）
- 7F: 字段 ⓘ help popover（desktop hover / mobile 跳详情页）
- 7G: F5 同步 format 按钮说明

### 13.2 Subagent 设计语言总结

- **字号**：14px 正文 baseline，label 11-12px / 700，title input 18px / 600
- **字体栈**：`-apple-system → PingFang SC → Hiragino Sans → Noto Sans CJK SC`（中日双语 system font，零外部网络请求）
- **Spacing scale**：4px grid (`--sp-1 ~ --sp-8`)，section 内 padding 16px / 间 gap 20px / body padding 16px (mobile) / 32px (1024px+)
- **Transition**：所有 hover/focus 均 150ms ease（`--tx`），无 keyframe（仅 7D loading spin）
- **border-radius**：4 / 6 / 8 / 10 / 12px scale

### 13.3 9 个被 PRD 采纳的 UX 决策（来自 subagent DESIGN.md §2）

| # | 决策 | PRD § |
|---|---|---|
| A | 单列布局，全断点 | §6.3 + §11 D3 已 retract 双列 |
| B | 顶部 sticky topbar 而非侧边 jump nav | §6.3 |
| C | **lang tab 在 body section 内部**，不是全局顶部 | §6.3 + §6.6 已修正 |
| D | format 切换 confirm 用 native `<dialog>` | §6.5 |
| E | 删除 ✕ 按钮 32px 实体 + 44×44 hit area（minw/minh padding） | §6.1 |
| F | compare 列用 `auto-fill minmax(260px, 1fr)` 自动响应 | §6.4.4 |
| G | quad 4 cells 标 `[0] 左上`/`[1] 右上`/`[2] 左下`/`[3] 右下` 强化顺序 | §6.4.5 |
| H | evaluations 行 is-filled 状态高亮（textarea 有内容→整行 bg 变 accent-soft+左 glyph 描边变色） | §6.3 |
| I | F5 不做 UI 暴露，只一个小字按钮 "F5 同步 format"（与 lang tab 同行右对齐，仅 zh/ja format 不一致时 enable） | §5.3 + §6.3 |

### 13.4 ⚠️ Token Swap 表（Dev 实施时必做）

Subagent prototype 用了**自己定义的 22 个硬编码字面量** + iOS 风蓝色 accent (`#007AFF`)，**不符合 [theme-package v1.0 design system](../../../Desktop/exports%203/theme-package/tokens.css) 墨黑主题**。Dev 实施时把 `styles.css` 的 `:root` 块**整体替换**成 v1.0 tokens.css 内容，并按下表把变量名 swap：

| Subagent prototype var | Design System v1.0 var | 含义 |
|---|---|---|
| `--color-bg-primary` (#ffffff) | `--bg` (oklch 0.985) | 页面 bg |
| `--color-bg-secondary` (#fafafa) | `--bg-soft` (oklch 0.965) | section bg |
| `--color-bg-tertiary` (#f5f5f7) | `--bg-soft` (复用) | 弱填充 |
| `--color-text-primary` (#1d1d1f) | `--text` (oklch 0.20) | 主文字 |
| `--color-text-secondary` (#2c2c2e) | `--text` (复用) | 次主文字 |
| `--color-text-tertiary` (#48484a) | `--text-2` (oklch 0.45) | 次文字 |
| `--color-text-quaternary` (#86868b) | `--text-3` (oklch 0.62) | 弱文字 / placeholder |
| `--color-border` (#e5e5ea) | `--border` (oklch 0.92) | 主描边 |
| `--accent-strategy` / `--accent` (#007AFF 蓝) | **`--primary` (oklch 0.20 墨黑)** | 主色 — **关键调换：从蓝改墨黑** |
| `--accent-soft` (8% blue tint) | `--primary-soft` (oklch 0.96) | 主色弱底 |
| `--s-danger` / `--s-success` / `--s-warning` (OKLCH) | 同名 | 状态色 — **巧合一致，不变** |
| 学派 chip 自定义颜色（subagent 没用 tag 系统）| **`--tag-mgmt` / `--tag-mkt` / `--tag-soc` 等** | schools 选择器 chip 必须按学派分类色 |
| `--font-sans` / `--font-mono` | 同名 | 字体栈 — 一致，不变 |
| `--sp-1 ~ --sp-8` | 同名 | spacing — 一致，不变 |
| `--r` / `--r-sm` / `--r-md` / `--r-lg` / `--r-xl` | 同名 | radius — 一致，不变 |
| `--tx` (150ms ease) | 自加（v1.0 没定义）| transition — 沿用 |

**关键调换**：subagent 用 iOS 蓝 `#007AFF` 作主色，design system v1.0 用墨黑 `oklch(0.20 0.005 80)`。**视觉气质完全不同**（subagent 偏 iOS App，v1.0 偏日式学术）。**用户已选 v1.0**，所以墨黑赢，prototype 看到的蓝色按钮 / focus 环 / active tab 全部转墨黑。

**学派 chip 强制接 tag 系统**：subagent 没用 `--tag-*`，自己用普通灰阶画 schools chip。Dev 实施时按 [tokens.css §L3](../../../Desktop/exports%203/theme-package/tokens.css) 的 `--tag-mgmt` (经营绿) / `--tag-mkt` (营销黄) 等给每个学派 chip 上色。

### 13.5 Subagent 列出的 Dev 实施待补项（13 条）

prototype 是静态视觉 only。Dev 实施时必须补全（拷自 DESIGN.md §5）：

1. 真实 API 调用（GET kp / PATCH / DELETE / GET metadata / GET empty-body）
2. 保存 fetch 流（debounce / response 解析 / updatedAt 刷新）
3. 错误重试逻辑（network 重试 / 409 刷新提示 / 422 字段定位）
4. ChipSelect autocomplete（filter + 键盘 ↑↓ Enter Esc 导航）
5. lang tab swap body editor 内容 + 不丢另一侧
6. F5 format 同步检测 + 触发逻辑
7. format 切换 confirm + lead carry-over（提取 prose 第一句作新 lead）
8. dark mode token 切换（design system v1.0 已含明暗双模 token，Dev 加 `html.dark` 切换）
9. scroll spy（section 进视口时 jump nav 高亮）
10. textarea auto-resize（scrollHeight 方案）
11. **IME 输入保护**（compositionstart/end 期间不触发 value 更新，防中日文字符割裂）
12. native `<dialog>` 元素（Escape 关 + backdrop 点关）
13. ARIA live region（保存状态 + 错误 banner）

### 13.6 Subagent 给 Dev 的实施提示要点（拷自 DESIGN.md §6）

- **Body editor 架构**：每 format 一个 `mountXxxEditor(container, langData, onChange)` 函数，自包含；切 format 时 unmount 旧 + mount 新 + carry lead
- **flat-list IME**：`compositionstart` 暂停写回，`compositionend` 同步
- **compare cols**：6 字段中 `detail` 是 textarea，其余 5 个是 `input[type=text]`；col 数据结构 `{ title, keyword, desc, type, theories, detail }`
- **quad cells**：固定 4 个，UI 显示 `[0] 左上` 等位置标注；`emoji` 字段 `maxlength="2"` 限
- **accordion groups**：两层独立 "+ 添加" / "✕ 删除" 控件，零排序
- **保存节流**：不做 auto-save；点保存 disable 按钮 → response 后恢复 + save-area 显示时间戳；version 字段乐观锁
- **字段 help link**：desktop hover popover / mobile 点击跳 field-guide.md，用 `@media (hover: none)` 区分

---

**心智模型提醒**（写给实施者）：

> 这个重写的**核心 invariant**：用户在编辑器里看到的 = 保存到 D1 的 KpV08 = 详情页渲染出的 HTML。三者必须 byte-for-byte round-trip（除了服务端注入的 `updatedAt` 等元数据）。
>
> v0.7.x 编辑器违反过这个 invariant（lossy 切 format / format-body 不一致），导致 m178 bug。Stage 4 重写**不重复犯**。
