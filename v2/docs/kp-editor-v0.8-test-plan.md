# Stage 4 KP 编辑器重写 — 测试方案

> **状态**：Test Eng2 设计稿（v1，2026-05-04）。**不实施 Dev 代码**，只设计 case + scaffold .test.ts 骨架供 Dev 接力。
>
> **基于**：[v2/docs/KP-EDITOR-V0.8-PRD.md](../tender-robinson-8a19f8/v2/docs/KP-EDITOR-V0.8-PRD.md)（PM worktree）+ [kp-editor-v0.8-design/](../agent-ab13e3418c792a494/kp-editor-v0.8-design/) 高保真原型 + [migration-v0.8.md](v2/public/docs/migration-v0.8.md)（已 ship contract）。
>
> **不依赖** Dev Eng3 实施产出，纯 PRD + prototype 推导。
>
> **谁该读**：Dev Eng3（按 spec 写 .test.ts + 跑通 vitest/playwright）/ Test Eng3（ship 后验收）/ PM（看覆盖完不完）

---

## 0. 一页速览

**测试栈**（与 v2 现有基建对齐）：
- 单元测试：`vitest 2.1` + 真 SQLite shim（[v2/tests/shims/d1-test-db.ts](v2/tests/shims/d1-test-db.ts)）。
- 前端 DOM 测试：vitest **需切 `environment: 'jsdom'`**。当前 [v2/vitest.config.ts](v2/vitest.config.ts) 是 node — Dev 实施时给 `tests/editor/**/*.test.ts` 加 `// @vitest-environment jsdom` 行注释（per-file 切），并把 `jsdom` 加 devDeps。
- E2E：`playwright 1.59`，[v2/playwright.config.ts](v2/playwright.config.ts) 当前只 desktop chromium — Dev 实施时加 iPad Mini project（375×812 是 Mini 6th，但 PRD baseline 是 322px width，等同横屏 320 折叠区，需 `viewport: { width: 322, height: 768 }`）。
- 静态 grep（视觉 token swap）：bash `grep` 跑 CI，不需要 stylelint 完整链路。

**case 量化**（实施工时按 PRD §7.4 的 1.5d 单元 + 1d E2E + 0.5d 视觉 QA = 3d）：
- 前端单元 ~80 case（11 module）
- Backend 单元 ~10 case（F4 + F5 + supplement reason 翻译）
- E2E ~48 case（U1: 10 / U2: 6 / U3: 20 / U4: 4 / U5: 3 / U6: 5）
- a11y / viewport / 视觉 ~25 case
- **小计 ~163 case**，对应 PRD §9 上线 checklist 7 项。

**P0/P1/P2 划分**见 §6 验收 gate。

---

## 1. 测试覆盖矩阵

横轴 = PRD 章节要点，纵轴 = 测试种类。一格内 `□` = 覆盖 / `—` = 不适用。

### 1.1 §3 用户路径

| 路径 | 单元（vitest+jsdom） | E2E（playwright） | 视觉 | a11y | 备注 |
|---|---|---|---|---|---|
| U1 新建 KP | 5 form module empty render | 10 case (5 fmt × {zh,zh+ja}) | iPad Mini 322px 截图 | tab 顺序 | §4.1 |
| U2 编辑 KP | state.ts 加载 prefill | 5 fmt × 1 case 改 1 字段 | — | aria-live 保存 | §4.2 |
| U3 切 format（lead carry-over）| **format-switcher 5×4=20 path** | 5 fmt × confirm + 5 fmt × cancel | confirm dialog 截图 | dialog focus trap | §4.3 |
| U4 多语种维护 | lang-tabs 切换 state | 4 case (zh→ja→改→切回) | — | aria-selected on tab | §4.4 |
| U5 字段 ⓘ help | help-popover module | 3 case (desktop hover / mobile click / link) | — | popover role | §4.5 |
| U6 保存失败 | api.ts 错误分类 | 5 case (422/409/网络/字段定位) | error banner 截图 | role="alert" | §4.6 |

### 1.2 §5 数据模型

| 数据契约 | 单元 | E2E | 视觉 | a11y |
|---|---|---|---|---|
| EditorState shape (§5.1) | state.ts shape + dirty/save 状态机 | — | — | — |
| ja 单语种边界 (§5.2) | lang-tabs 空 form 占位 | U4 case ja-empty | — | — |
| F5 zh/ja format 强制 (§5.3) | **后端 schema refine 测试** + 前端 sync btn enable | E2E case in U3 | sync btn 状态 | btn aria-disabled |
| Q5 lead carry-over (§5.4) | format-switcher 20 path | U3 视觉验证 | — | — |
| evaluations 不受 format 影响 (§5.5) | format-switcher 不动 evaluations.zh/ja | U3 case 验证 | — | — |

### 1.3 §6 UX 设计

| 元素 | 单元 | E2E | 视觉 | a11y |
|---|---|---|---|---|
| iPad Mini 322px (§6.1) | — | viewport set | screenshot 322px | hit area ≥ 44×44 grep |
| design system token (§6.2) | — | — | **stylelint color-no-hex** + token swap grep | — |
| 单列 layout (§6.3) | — | scroll page | desktop 1280px = 单列扩 padding 截图 | — |
| 5 form spec (§6.4) | 5 form module 各自 render+serialize | U1/U2 各 fmt | each fmt 截图 | — |
| confirm dialog (§6.5) | format-switcher confirm | U3 case | dialog 截图 | Escape close + backdrop |
| lang tab 在 body 内 (§6.6) | lang-tabs DOM 位置 | U4 verify location | — | — |
| inline help (§6.7) | help-popover | U5 | popover 截图 | — |

### 1.4 §7.1 文件 / module 清单

| Module 文件 | 单元 .test.ts | 主要测点 |
|---|---|---|
| `editor/state.ts` | `state.test.ts` | EditorState shape / update reducer / dirty / saveStatus 转移 |
| `editor/api.ts` | `api.test.ts` | 5 endpoint 调用 / 错误分类（422/409/5xx/network） |
| `editor/dom-helpers.ts` | `dom-helpers.test.ts` | input/textarea/btn/chip/dialog 创建 + 事件 |
| `editor/format-switcher.ts` | `format-switcher.test.ts` | **lead carry-over 5×4=20 path** + confirm + GET empty-body 集成 |
| `editor/forms/narrative.ts` | `forms/narrative.test.ts` | empty render / prose 改 / serialize → KpBody |
| `editor/forms/flat-list.ts` | `forms/flat-list.test.ts` | items 增删 / IME 保护 / serialize |
| `editor/forms/accordion.ts` | `forms/accordion.test.ts` | 两层嵌套增删 / serialize |
| `editor/forms/compare.ts` | `forms/compare.test.ts` | 6 字段 col / 列增删 / serialize |
| `editor/forms/quad.ts` | `forms/quad.test.ts` | 4 cell 固定位置 / emoji maxlength=2 / serialize |
| `editor/eval-panel.ts` | `eval-panel.test.ts` | 6 字段 → KpEvaluationsLang / 全空 → undefined / is-filled 高亮 |
| `editor/lang-tabs.ts` | `lang-tabs.test.ts` | zh↔ja 切换 / ja 不存在显空 form / 单语种边界 |
| `editor/relations-panel.ts` | `relations-panel.test.ts` | schools/scholars/tags chip 增删 / `--tag-*` color 应用 |
| `editor/help-popover.ts` | `help-popover.test.ts` | desktop hover / mobile click / `@media (hover: none)` 分支 |

**未覆盖（PRD 明确不做）**：autosave / draft / 排序控件 / "复制 zh 起手" 按钮（D2=B 不做）/ 富文本编辑。

### 1.5 §7.5 跟 v0.8.0 已 ship 的接口

| 接口 | 已有测试 | Stage 4 是否补 |
|---|---|---|
| `GET /api/kps/empty-body` | [kps-v08-contract.test.ts](v2/tests/kps-v08-contract.test.ts) §4 已覆盖 5 fmt + 缺/非法 | ❌ 不重复 |
| `POST /api/kps` | 已覆盖 happy + 6 reason | F5 加 `body.zh.format != ja.format` 拒绝 case |
| `PATCH /api/kps/:id` | 已覆盖 partial-by-language | F5 同上（PATCH 同时给 zh+ja 不一致） |
| `GET /api/kps/:id` | 已覆盖（read 路径） | ❌ |
| `GET /api/metadata` | [metadata-api.test.ts](v2/tests/metadata-api.test.ts) | ❌ |

---

## 2. 前端单元测试 spec（按 module）

> **共用约定**：
> - 每文件首行 `// @vitest-environment jsdom`
> - 每 test 函数前用 `import { JSDOM } from 'jsdom'` 或 vitest 自动注入的全局 `document`
> - serialize 输出**必须过 KpBody.parse**（zod safeParse 后 expect ok），不只是 deep-equal — 防 schema invariant 漂移
> - 改字段后断言 `state.isDirty === true`

### 2.1 `state.test.ts` (~6 case)

```
describe EditorState shape
  ✓ initEditor() with create-new payload → state 含 5 默认字段（id 空 / activeLang='zh' / activeFormat='narrative' / isDirty=false / saveStatus='idle'）
  ✓ initEditor() with existing KP payload → prefill body.zh / body.ja / evaluations / schools / scholars / tags / year / title 正确

describe state transitions
  ✓ updateField('title.zh', 'X') → state.title.zh === 'X' + isDirty=true
  ✓ saveStatus 状态机：idle → saving → saved (200) → idle after 2s (auto reset)
  ✓ saveStatus 状态机：idle → saving → error (4xx/5xx) → 保留 error 直到下次 save 触发
  ✓ resetDirty() 不动 saveStatus（独立 state）
```

### 2.2 `api.test.ts` (~10 case)

> 用 `vi.spyOn(globalThis, 'fetch')` mock fetch；不调真 endpoint。

```
describe getKp / getMetadata / getEmptyBody
  ✓ getKp(id) → GET /api/kps/:id → 解 200 OK → 返 KP shape
  ✓ getMetadata(discipline) → GET /api/metadata?discipline=X
  ✓ getEmptyBody(format) → GET /api/kps/empty-body?format=X → 返 KpBody

describe createKp / updateKp 错误分类（按 PRD §4.1）
  ✓ POST 200 → { ok: true, kp }
  ✓ POST 422 reason='legacy_*' → 抛 EditorBugError + console.error 含 detail（不应发生但要 catch）
  ✓ POST 422 reason='body_format_invalid' → 抛 ValidationError（field='body.zh.format'）
  ✓ POST 422 reason='body_structure_invalid' → 抛 ValidationError（含 zod issue path）
  ✓ POST 422 reason='schema_invalid'（F4 修后非 body 字段错） → 抛 ValidationError（field='*' 或 detail.path[0]）
  ✓ PATCH 409 reason='version_conflict' → 抛 ConflictError（含 currentVersion/expectedVersion）
  ✓ POST 5xx → 抛 NetworkError + 触发重试（fetch mock 第 2 次 200 → 不抛）
  ✓ POST network reject → 抛 NetworkError（无重试逻辑用户手动）
```

### 2.3 `dom-helpers.test.ts` (~5 case)

```
describe createInput
  ✓ createInput({ value: 'X', onInput }) → <input value="X"> + input event 触发 onInput
  ✓ createInput 设 placeholder + maxlength + aria-label

describe createTextarea
  ✓ createTextarea auto-resize on input（scrollHeight 同步 style.height）
  ✓ IME 保护：compositionstart → 暂停 onChange；compositionend → 触发 onChange

describe createButton
  ✓ createButton({ type: 'primary' }) → 含 class 'kpe-btn-primary' + aria-disabled state

describe createChip
  ✓ createChip({ label: 'X', onRemove }) → ✕ 按钮 click 触发 onRemove

describe createDialog
  ✓ createDialog → 真 native <dialog> 元素 + show()/close() 工作
  ✓ Escape 键 close + backdrop click close
```

### 2.4 `format-switcher.test.ts` (~30 case)

> **核心**：lead carry-over 5×4 = 20 transition path + confirm + GET empty-body 集成。

```
describe lead carry-over (Q5 — PRD §5.4) — 5 × 4 = 20 path
  // 5 个 from format × 4 个 to format（不能切到自己）
  ✓ narrative → flat-list: prose='abc 123' → flat-list.lead='abc 123' + items=[{name:'',desc:''}]
  ✓ narrative → accordion: prose → accordion.lead + groups=[{title:'',items:[]}]
  ✓ narrative → compare: prose → compare.lead + cols=[2 空 col]
  ✓ narrative → quad: prose → quad.lead + cells=[4 空 cell] + yAxis/xAxis 空
  ✓ flat-list → narrative: lead='导' → narrative.prose='导' + items 全丢
  ✓ flat-list → accordion: lead → accordion.lead + groups 空
  ✓ flat-list → compare: lead → compare.lead
  ✓ flat-list → quad: lead → quad.lead
  ✓ accordion → narrative: lead → prose
  ✓ accordion → flat-list
  ✓ accordion → compare
  ✓ accordion → quad
  ✓ compare → narrative
  ✓ compare → flat-list
  ✓ compare → accordion
  ✓ compare → quad
  ✓ quad → narrative
  ✓ quad → flat-list
  ✓ quad → accordion
  ✓ quad → compare

describe carry-over 边界
  ✓ narrative.prose 含 HTML <strong> + 多段 \n\n → 整段保留进 lead string
  ✓ narrative.prose 空字符串 → 新 format lead 空，不报错
  ✓ 非 narrative 间互切 lead 完整保留（≠空）

describe confirm dialog
  ✓ 用户点"切" → dialog 弹出（dialog.open === true）
  ✓ 点"取消" → state 不变 + dialog 关
  ✓ 点"确认切换" → 调 GET /api/kps/empty-body?format=<new> → state.body[lang] 替换 + lead 灌入
  ✓ 新建 KP 第一次选 format（body 仍 empty 模板）→ 不弹 confirm（直接切，避免无意义 confirm）

describe F5 同步逻辑（zh+ja format 不一致时）
  ✓ zh.format='narrative' / ja.format='flat-list' → sync btn enable + tooltip 含当前 mismatch
  ✓ 点 sync btn → 弹 confirm "ja 将切到 narrative，丢失 ja 当前 flat-list 内容" → 确认后 ja 同步

describe Q7 强制：当切 format 时 zh+ja 同时改
  ✓ body.ja 存在时 → 切 format confirm 后 zh+ja 都换成新 format empty + lead carry
  ✓ body.ja 不存在 → 只换 zh
```

### 2.5 `forms/narrative.test.ts` (~4 case)

```
describe NarrativeForm
  ✓ render(empty NarrativeBody) → 单 <textarea rows=12>
  ✓ render(prefilled prose='X') → textarea.value === 'X'
  ✓ 改 textarea → onChange({ format: 'narrative', prose: '<新>' })
  ✓ serialize() → 返 { format: 'narrative', prose: <textarea.value> }，过 NarrativeBody.parse OK
```

### 2.6 `forms/flat-list.test.ts` (~7 case)

```
describe FlatListForm
  ✓ render(empty FlatListBody) → lead textarea + 1 个 item form（emptyKpBody 起手）
  ✓ 改 lead textarea → state.body.lead 更新
  ✓ 改 item.name/desc → state.body.items[i] 更新
  ✓ 点 "+ 添加条目" → items.length + 1（新空 item）
  ✓ 点 item ✕ → items.length - 1（splice 对应 index）
  ✓ items 空时 serialize() → 仍返 items=[]（zod 后续会拒；form 不自己拦）
  ✓ IME 保护：composition 期间 input event 不触发 onChange

describe Q6 顺序固定
  ✓ DOM 上无上下箭头按钮 / 无 drag handle（grep .kpe 内 'order' 'sort' 'move' = 0）
```

### 2.7 `forms/accordion.test.ts` (~7 case)

```
describe AccordionForm
  ✓ render(empty AccordionBody) → lead + 1 group(空 items)
  ✓ "+ 添加组" → groups.length + 1
  ✓ 组内 "+ 添加条目" → groups[i].items.length + 1
  ✓ 删除 item → groups[i].items.splice
  ✓ 删除组 → groups.splice
  ✓ serialize() → 过 AccordionBody.parse OK
  ✓ 嵌套删除：删组 i 中的 item j 不影响组 i+1
```

### 2.8 `forms/compare.test.ts` (~6 case)

```
describe CompareForm
  ✓ render(empty CompareBody) → 2 col（emptyKpBody 起手）
  ✓ col 6 字段：title/keyword/desc/type/theories/detail（detail 是 textarea，其余 input）
  ✓ "+ 添加列" → cols.length + 1
  ✓ 删除列 → cols.splice
  ✓ cols < 2 时 serialize() → 仍返 cols=[1]（zod 后续会拒）
  ✓ serialize() → 过 CompareBody.parse OK（cols >= 2）
```

### 2.9 `forms/quad.test.ts` (~7 case)

```
describe QuadForm
  ✓ render(empty QuadBody) → yAxis input + xAxis input + 4 cell（cells 数组固定 4）
  ✓ 4 cell 各自标 [0]左上 / [1]右上 / [2]左下 / [3]右下（DOM grep）
  ✓ 改 yAxis/xAxis input → state 更新
  ✓ 改 cell.name/emoji/sub/detail → cells[i] 更新
  ✓ emoji input maxlength=2（DOM attr verify）
  ✓ 没有 "+ 添加 cell" / "✕ 删除 cell" 按钮（4 cell 固定，DOM grep = 0）
  ✓ serialize() → 过 QuadBody.parse OK（cells.length === 4）
```

### 2.10 `eval-panel.test.ts` (~6 case)

```
describe EvalPanel
  ✓ render(empty) → 6 textarea (meaning/limit/example/response/application/analogy)
  ✓ render(prefilled meaning='M') → meaning textarea = 'M' + 整行 class 含 'is-filled'
  ✓ render(空 string) → 不含 'is-filled' class
  ✓ 改 textarea → state.evaluations.<lang> 更新
  ✓ serialize(全 6 空) → undefined（不发 evaluations.<lang>）
  ✓ serialize(任一非空) → KpEvaluationsLang object 含 6 字段（其它 5 个为空 string）

describe lang 切换不污染 evaluations
  ✓ zh 写 meaning='M' → 切 ja → 改 meaning='Mja' → 切回 zh → meaning 仍是 'M'
```

### 2.11 `lang-tabs.test.ts` (~5 case)

```
describe LangTabs
  ✓ 默认 activeLang='zh' → ZH tab 含 class 'is-active' + aria-selected="true"
  ✓ 点 JA tab → activeLang='ja' + 切换 body / evaluations 显示
  ✓ ja 不存在 → JA tab 仍可点 → body 显示空 form（emptyKpBody for current activeFormat）
  ✓ ja 不存在 → DOM **无** "复制 zh 起手" 按钮（D2=B 不做，grep "复制" "copy" = 0）
  ✓ 切回 zh → 之前 zh 内容完整保留（没被 ja 写覆盖）
```

### 2.12 `relations-panel.test.ts` (~6 case)

```
describe RelationsPanel
  ✓ render(empty) → 3 个 chip-select 区（schools/scholars/tags）+ year input + 3 title input (zh/ja/en)
  ✓ 加 chip：输入 → autocomplete dropdown → 选项 enter → chip 加入 + dropdown 关
  ✓ 删 chip：点 ✕ → chip 移除
  ✓ schools chip 应用 `--tag-*` color（DOM style 含 'oklch' + 学派 key match）
  ✓ year input 接受任意字符串（"1979" / "1980s" / "" 都不报错；schema 是 z.string().default('')）
  ✓ title.zh 必填星号 `*` 显示，placeholder 不含 "中文标题必填"（PRD §11 A 类 hint reject）
```

### 2.13 `help-popover.test.ts` (~4 case)

```
describe HelpPopover
  ✓ desktop @media (hover: hover) → ⓘ icon hover → popover open
  ✓ mobile @media (hover: none) → ⓘ icon click → popover open（hover 不触发）
  ✓ popover 内含字段 1 句定义 + link "查看完整教学 →" → href 含 'kp-field-guide.md#'
  ✓ Escape 键关 popover
```

### 2.14 跨 module token 一致性（视觉 regression 但适合 unit 写）

> 说明：[tokens.css](v2/src/styles/tokens.css)（待 Dev copy 自 [theme-package v1.0](../../../Desktop/exports%203/theme-package/tokens.css)）的 token swap 是 PRD §6.2 + §13.4 的硬约束。这条放单元而非 E2E，因为是静态 grep。

```
describe token-no-hex.test.ts
  ✓ src/lib/editor/**/*.ts + src/styles/kp-edit*.css 全 grep '#[0-9a-fA-F]{3,6}' = 0 命中（除 placeholder emoji 本身）
  ✓ src/lib/editor/**/*.ts + src/styles/kp-edit*.css 全 grep 'rgb(' / 'rgba(' / '\bblack\b' / '\bwhite\b' = 0 命中
  ✓ subagent prototype 字面色 #007AFF / #fafafa / #1d1d1f / #e5e5ea 不出现在编辑器代码（按 PRD §13.4 swap 表）
```

---

## 3. Backend 单元测试更新（F4 + F5）

### 3.1 F4: `classifyZodFailure` 默认 reason → schema_invalid

**改动**：[v2/src/lib/kp-legacy-detector.ts](v2/src/lib/kp-legacy-detector.ts):131-141 的 `classifyZodFailure` 当前默认归 `body_structure_invalid`，**应改成**当 issue path 不触及 body 时 → `schema_invalid`（新 reason）。

**新 .test.ts**：`v2/tests/kp-legacy-detector-f4.test.ts`

```
describe F4 classifyZodFailure path 分流
  ✓ issue.path = ['body','zh'] + invalid_union_discriminator → 'body_format_invalid'
  ✓ issue.path = ['body','zh','items',0,'name'] (非 discriminator) → 'body_structure_invalid'
  ✓ issue.path = ['body','ja','cells'] length error → 'body_structure_invalid'
  ✓ issue.path = ['title','zh'] (非 body 字段) → **'schema_invalid'**（F4 修后）
  ✓ issue.path = ['schools'] zod array empty → 'schema_invalid'
  ✓ issue.path = ['updates',0,'patch','title'] (batch 非 body) → 'schema_invalid'
  ✓ issue.path = [] (顶层 .strict() unrecognized_keys) → 'schema_invalid'
```

**对应 endpoint 测试**（在 `v2/tests/kps-v08-contract.test.ts` 加 1 case 或新文件）：

```
describe F4 endpoint 集成
  ✓ POST 含 unknown 顶层字段 'foo' → 422 reason='schema_invalid'（不再是 body_structure_invalid）
  ✓ POST title.zh = '' (违反 min(1)) → 422 reason='schema_invalid'
  ✓ POST schools=[] → 422 reason='schema_invalid'（非 body 错也归 schema_invalid）
```

### 3.2 F5: schema 强制 `body.zh.format === body.ja.format`

**改动**：[v2/src/schemas/kp-api.ts](v2/src/schemas/kp-api.ts):32-37 的 `KpBodyBilingual` 加 `.refine`（PRD §5.3 已给样例）。`KpBodyBilingualPartial` (line 57-63) 同步加 — 但要小心：partial 时只给 zh 不给 ja（或反），refine 应通过；只有当 zh+ja 都给且 format 不同时拒。

**新 .test.ts**：`v2/tests/kp-bilingual-format-refine-f5.test.ts`

```
describe F5 KpBodyBilingual refine（POST 路径 — 创建 KP）
  ✓ zh.format='narrative' + ja 缺 → pass（ja 是 optional）
  ✓ zh.format='narrative' + ja.format='narrative' → pass
  ✓ zh.format='flat-list' + ja.format='accordion' → fail，error.message 含 '一致'
  ✓ POST 端到端：zh+ja format 不一致 → 422，detail 含 refine message

describe F5 KpBodyBilingualPartial refine（PATCH 路径 — 部分更新）
  ✓ patch 只给 zh → pass（不检查 ja，ja 由现有 KP 决定）
  ✓ patch 只给 ja → pass
  ✓ patch 同时给 zh+ja format 不同 → fail
  // 注意：patch 单语种 + 现有另一语种 format 不一致这个场景，refine 在 schema 层无法看到 existing — 需 server-side 再查
  □ PM ASK §7.1: server 是否要在 PATCH partial 时 GET 现有 KP 的另一语种 format 跟 patch 给的 format 比较？
    - 选项 A: 是（强一致 — 但 server 多 1 次 query）
    - 选项 B: 否（信任前端 / 容忍 dirty 状态，由编辑器 F5 sync btn 暴露给用户）
    - PRD §5.3 没明确 — 倾向 B（编辑器 UI 已强制 + 直接 API 调老师 agent 是次要 case）

describe F5 supplement.T2.2 翻案
  // T2.2 (现有 supplement.test.ts:180) 当前测 "POST zh+ja 不同 format → 201" — F5 后应 422
  ✓ supplement.test.ts T2.2 改 expect status=422 + reason 含 refine message
```

### 3.3 翻案：现有 supplement.test.ts 的 reason expectation

[v2/tests/kps-v08-stage3-supplement.test.ts](v2/tests/kps-v08-stage3-supplement.test.ts) 中 F4 修后**reason 需翻案**的 case：

| case | 当前 expect | F4 修后 expect | 理由 |
|---|---|---|---|
| T6.3 (line 690-712) `KpId 非法格式` | status=422（reason 没 assert） | reason='schema_invalid' | id 非 body 字段，path=['id']，F4 后归 schema_invalid |
| T8.1 (line 777-796) 大写 `Format` 字段 | reason='body_structure_invalid'（line 795） | **reason='schema_invalid'** | unrecognized_keys 在顶层 .strict()，path=[]，F4 后归 schema_invalid |
| T11.1 (line 1098-1111) batch patch 含 `id` | reason='forbidden_field' | 保持 'forbidden_field' | server 自己显式处理，不走 zod，无影响 |
| T11.2 (line 1113-1125) batch patch 含 `created_at` | reason='forbidden_field' | 保持 | 同上 |

**Dev 注意**：T6.3 + T8.1 是 supplement 文件中已 ship 的 case，F4 改 detector 后这两条会自动变红。Dev 需主动改 expect — 或者新增 case 单独覆盖 schema_invalid，旧 case skip。建议**改 expect**（不要 skip），因为这些 case 本质就是测 reason 分类。

---

## 4. E2E 测试 spec（playwright）

### 4.0 公共 fixture

```ts
// v2/tests/e2e/fixtures/editor.ts
export async function loginAsAdmin(page) { /* 复用 auth.spec.ts 模式 */ }
export async function gotoNewKp(page, discipline='keiei') {
  await page.goto(`/${discipline}/kp/new`);
}
export async function gotoEditKp(page, id, discipline='keiei') {
  await page.goto(`/${discipline}/kp/${id}/edit`);
}
export async function setIPadMiniViewport(page) {
  await page.setViewportSize({ width: 322, height: 768 });
}
```

**测试前提**（同现有 e2e/auth.spec.ts）：
- 本地 D1 已 apply migrations + sync
- `.dev.vars` 含 `ADMIN_PASSWORD=test-admin-pw`
- astro dev 跑 :4321
- **种子数据**：`scripts/seed-e2e-kp.ts`（待 Dev 写）插 5 fmt 各 1 条 KP（id k_e2e_n / k_e2e_fl / k_e2e_ac / k_e2e_cm / k_e2e_qd）

### 4.1 U1 新建 KP — `kp-editor-u1-create.spec.ts` (~10 case)

每 case：login → goto /keiei/kp/new → 填字段 → 点保存 → expect 201 + KP DB row 存在。

| # | format | ja? | 关键步骤 | expected |
|---|---|---|---|---|
| U1-1 | narrative | no | title.zh + schools[1] + body.zh.prose | 201 + DB 含 body_zh_json.format='narrative' |
| U1-2 | narrative | yes | + title.ja + body.ja.prose | DB ja 列非 null |
| U1-3 | flat-list | no | + 加 2 items | 201 |
| U1-4 | flat-list | yes | + ja 同 fmt + 2 items | 201 |
| U1-5 | accordion | no | 1 group + 2 items | 201 |
| U1-6 | accordion | yes | | 201 |
| U1-7 | compare | no | 2 cols + 6 字段填 col[0].title='X' | 201 |
| U1-8 | compare | yes | | 201 |
| U1-9 | quad | no | yAxis/xAxis + 4 cells.name 全填 | 201 |
| U1-10 | quad | yes | | 201 |

**每 case 共通断言**：
- 保存按钮**仅在 title.zh 填好后 enable**（PRD §6.3 layout 决策）
- 保存后跳转到 `/keiei/kp/<id>/edit`（U1 → U2 流转）
- network 看到 1 次 `POST /api/kps?discipline=keiei`，无意外 PATCH/DELETE

**失败模式调试 hint**：
- `Save button stays disabled` → 检查 title.zh validation 触发 / button data-disabled attr
- `redirect failed` → 检查 POST response 是否含 `kp.id`

### 4.2 U2 编辑 KP — `kp-editor-u2-edit.spec.ts` (~6 case)

每 case：goto /keiei/kp/k_e2e_<fmt>/edit → 改 1 字段 → 保存。

| # | KP id | 改字段 | expected |
|---|---|---|---|
| U2-1 | k_e2e_n | title.zh | PATCH 200 + title 更新 |
| U2-2 | k_e2e_fl | items[0].name | PATCH 200 + body.zh.items[0].name 更新 |
| U2-3 | k_e2e_ac | groups[0].title | PATCH 200 |
| U2-4 | k_e2e_cm | cols[0].keyword | PATCH 200 |
| U2-5 | k_e2e_qd | cells[0].emoji | PATCH 200 |
| U2-6 | k_e2e_fl | evaluations.zh.meaning | PATCH 200 + evaluations_zh_json 含 meaning |

**断言**：
- prefill 后所有字段 value 跟现有 KP 一致（截屏 vs baseline）
- 改 1 字段 → save btn enable + isDirty 视觉指示（按 PRD §13.5 #2 应 disable on save click）

### 4.3 U3 切 format — `kp-editor-u3-format-switch.spec.ts` (~25 case)

**核心**：5×4=20 transition + 5 cancel + 切 format 时 evaluations 不动。

```
describe U3 lead carry-over (20 transition)
  for from in [narrative, flat-list, accordion, compare, quad]
    for to in 其它 4
      ✓ 编辑 from KP 现有数据 → 点切 format → 选 to → confirm dialog 出 → 确认
        → expect: 1) body.lang 切到 to format empty + lead 灌入 from 的 lead-equiv text
                  2) network 看到 GET /api/kps/empty-body?format=<to>
                  3) confirm dialog 文案含 "lead 会保留" + 旧 fmt name + 新 fmt name

describe U3 cancel
  ✓ from=narrative → 选 flat-list → 弹 dialog → 点取消 → state 不变（截屏 vs baseline）
  // 5 fmt 各跑 1 cancel case = 5 case

describe U3 evaluations 不受 format 影响（PRD §5.5）
  ✓ 编辑 KP（含 evaluations.zh.meaning='M'）→ 切 fmt → 确认 → expect evaluations.zh.meaning 仍 'M'

describe U3 新建 KP 第一次选 format（不弹 confirm）
  ✓ /keiei/kp/new → 默认 fmt=narrative → 点 fmt=flat-list → **不弹 dialog**（直接切，body 仍空）
  ✓ /keiei/kp/new → narrative → 写 prose='X' → 切 flat-list → **弹 dialog**（body 已脏）

describe U3 F5 同步按钮（zh.format != ja.format）
  ✓ 已有 KP zh=narrative ja=flat-list（直接 D1 插 dirty 数据）→ goto edit
    → expect F5 sync btn enable + 文案含 "format 不一致"
  ✓ 点 F5 sync btn → 弹 confirm "ja 将切到 zh format" → 确认 → ja 切 narrative + lead carry
  ✓ zh.format == ja.format → F5 sync btn disable
```

### 4.4 U4 多语种维护 — `kp-editor-u4-lang-tabs.spec.ts` (~4 case)

```
✓ U4-1 写 zh 内容 → 切 ja → ja form 显示空（emptyKpBody for narrative）
  → 不显示 "复制 zh 起手" 按钮（PRD D2=B grep）
✓ U4-2 zh 写 → 切 ja 写 → 切回 zh → zh 内容完整保留（截屏 + DOM value 校验）
✓ U4-3 evaluations 也跟 lang tab 切（zh.meaning='M' / ja.meaning='Mja' 各自独立）
✓ U4-4 切 lang tab 时 title (3 语种) / schools / scholars / tags / year **不随切**（仍显示）
```

### 4.5 U5 字段 ⓘ help — `kp-editor-u5-help.spec.ts` (~3 case)

```
✓ U5-1 desktop chromium：hover format selector ⓘ icon → popover 出 + 含 "查看完整教学 →" link
✓ U5-2 iPad Mini viewport (322px) + touch device emulation：tap ⓘ icon → popover 出（hover 不触发）
✓ U5-3 popover 内 link href 含 'study.sususu.org/docs/kp-field-guide.md#' anchor
```

### 4.6 U6 保存失败 — `kp-editor-u6-error.spec.ts` (~5 case)

> 用 `page.route('/api/kps/**', ...)` mock backend 错误 response。

```
✓ U6-1 mock POST 422 reason='body_structure_invalid' detail.path=['body','zh','items',0,'name']
  → 编辑器 inline 错误：toast 显示 reason + 字段 highlight (kpe-error-banner / item.name input red border)
  → 输入不丢（expect items[0].name 仍是用户填的内容）
✓ U6-2 mock PATCH 409 reason='version_conflict'
  → 显示 "KP 已被其它 session 更新" + "重载" 按钮
  → 点 "重载" → 触发 GET /api/kps/:id 刷新 + reapply 用户输入（PRD §4.1）
✓ U6-3 mock POST 网络 reject（page.route abort）
  → "保存失败，请重试" + 输入不丢
✓ U6-4 mock POST 422 reason='legacy_top_level_format' （编辑器 bug — 不应发生但测兜底）
  → "编辑器 bug，请反馈" + console.error 含完整 detail
✓ U6-5 mock POST 403 reason='tenant_mismatch'
  → "权限不足或字段禁止" + link to admin
```

---

## 5. a11y / viewport / 视觉 regression

### 5.1 a11y — `kp-editor-a11y.spec.ts` (~8 case)

```
✓ A1 键盘 tab 顺序：top bar → relations → title → lang tab → format selector → body form fields → eval panel → save btn
  全程 expect document.activeElement 沿可访问顺序，零 trap 漏出
✓ A2 focus 环可见：每 input/button/textarea focus 后 outline width >= 2px（getComputedStyle）
✓ A3 aria-live 错误提示：触发 422 → 错误 banner 元素 role="alert"，aria-live="assertive"
✓ A4 aria-live 保存状态：点保存 → save status text role="status" + aria-live="polite"
✓ A5 chip ✕ 按钮 aria-label="移除 <chip-name>"（PRD prototype L107 已示例）
✓ A6 lang tab role="tab" + aria-selected + 容器 role="tablist"
✓ A7 format pills role="radiogroup" + role="radio" + aria-checked（PRD prototype L179）
✓ A8 confirm dialog focus trap：dialog open → tab 不能跳出 dialog；Escape 关
```

### 5.2 viewport — `kp-editor-viewport.spec.ts` (~10 case)

```
describe iPad Mini 322×768
  for fmt in 5
    ✓ goto edit fmt → 截屏 → 不出现横向 scroll bar (page.evaluate document.documentElement.scrollWidth <= 322)
  ✓ confirm dialog 在 322px 不溢出
  ✓ 触屏 hit area：所有 [.kpe-btn, .kpe-lang-tab, .kpe-item-del, .kpe-add-btn, .kpe-chip-x] 实际 bounding box >= 44×44

describe desktop 1280×800
  ✓ goto edit narrative → 截屏 vs baseline（单列 + 扩 padding，不双列）
  ✓ max-width 880px + margin 0 auto（DESIGN.md §3）→ 视觉居中
```

### 5.3 视觉 token swap regression — `kp-editor-token-swap.spec.ts` (~5 case)

```
✓ V1 静态 grep（也在单元 §2.14 覆盖 — E2E 这里加 cross-check）：
  pnpm exec grep -rE '#[0-9a-fA-F]{3,6}|rgb\(|\bblack\b|\bwhite\b|#007AFF' v2/src/lib/editor v2/src/styles/kp-edit*.css
  → 0 命中
✓ V2 截屏 sample 5 fmt × 1 desktop + 1 mobile = 10 张
  → 灰度提取主色（ffmpeg/ImageMagick + jq pixel sample）→ 主按钮 / focus 环颜色应 match 墨黑 oklch(0.20 0.005 80)
  → 不应出现 iOS 蓝 #007AFF（hex range = blue dominant）
✓ V3 学派 chip 应用 --tag-* 色：sample school chip "motivation" → 应是 --tag-mgmt 色（oklch 绿，不是灰）
✓ V4 dark mode 切换：html.dark + 截屏 → 整页颜色反相（按 design system v1.0 双模 token）
✓ V5 stylelint --color-no-hex（如果 Dev 接入）跑 pnpm test 全 0 violation
```

---

## 6. 验收 gate（Stage 4 ship 前 must pass）

对照 PRD §9 上线 checklist + 本 plan 的 case，按 P0/P1/P2 列：

### P0 — 阻塞 ship

| # | gate | 对应 §  | 通过标准 |
|---|---|---|---|
| P0.1 | 5 form module 单元 + serialize → KpBody.parse OK | §2.5-2.9 | 30 case 全 pass |
| P0.2 | format-switcher lead carry-over 20 path | §2.4 | 20 case 全 pass，0 dev expect-skip |
| P0.3 | F4 + F5 backend 修 + 测试更新 | §3 | 新增 ~10 case + supplement T2.2/T6.3/T8.1 翻案全 pass |
| P0.4 | U1-U6 E2E 主线 | §4 | 48 case 全 pass，0 flaky |
| P0.5 | iPad Mini 322px viewport — 5 fmt 无横向 scroll | §5.2 | 5 fmt 截屏 + DOM scrollWidth check pass |
| P0.6 | token-no-hex grep / 关键 hex `#007AFF` 不出现 | §2.14 + §5.3 V1 | 0 命中 |
| P0.7 | KP body 编辑 → 保存 → 详情页渲染 byte-for-byte round-trip（PRD §13 心智模型）| 需新加 E2E | 5 fmt 各 1 case：编辑 → 保存 → goto detail → page screenshot vs prefill 视觉一致 |

### P1 — should fix（不阻塞 ship 但 v0.8.x patch 跟）

| # | gate | 对应 § |
|---|---|---|
| P1.1 | a11y A1-A8 全 pass | §5.1 |
| P1.2 | F5 sync btn 视觉 + click 流 | §2.4 + §4.3 |
| P1.3 | help-popover desktop hover / mobile click 分支 | §2.13 + §4.5 |
| P1.4 | dark mode 切换 (V4) | §5.3 V4 |
| P1.5 | E2E error U6-1 ~ U6-5 错误分支 | §4.6 |
| P1.6 | prod audit `body.zh.format != body.ja.format` 0 mismatch | PRD §9 |

### P2 — nice to have

| # | gate | 对应 § |
|---|---|---|
| P2.1 | textarea auto-resize 单元 | §2.3 |
| P2.2 | IME 保护单元 | §2.3 + §2.6 |
| P2.3 | tag chip 学派分类色精确 OKLCH 值（不只是 grep "oklch") | §5.3 V3 |
| P2.4 | 老师 agent 通知（Stage 5 才做，PRD §9 标 deferred） | — |

---

## 7. PM ASK / 设计歧义点

> 设计阶段碰到的 PRD 没明确的点，等 PM 回答后再 lock。Dev 可以先按推荐答案实施，PM 回答后调整。

### 7.1 F5 schema refine 在 PATCH partial 时的语义

**问题**：[v2/src/schemas/kp-api.ts](v2/src/schemas/kp-api.ts):57-63 的 `KpBodyBilingualPartial`，PATCH 时调用方只发 `body.zh`（不发 ja），现有 KP 的 body.ja.format 跟新 zh.format 不一致 → schema 看不到 existing，无法 refine。

**3 个选项**：
- **A** server 在 PATCH 时显式 GET 现有 KP 的另一语种 format，跟 patch 给的对比，不一致拒。优：强一致；劣：多 1 次 query。
- **B** 信任前端：编辑器 UI F5 sync btn 暴露给用户处理，老师 agent 直接调 API 不一致就让它 dirty（这是 D2 minimalism 思路的延续）。
- **C** 加新 reason `body_format_mismatch_after_patch`，server 跑 simulation merge 后 refine。

**推荐 B**（PM 倾向 minimalism，且老师 agent 是次要 case）。

### 7.2 U1 新建保存后跳转到 edit 页

**问题**：PRD §3 U1 描述 "一次保存完成"，但没说保存后是 stay on /new 还是 redirect 到 /edit/:id。

**推荐**：保存成功后 client redirect 到 `/[discipline]/kp/<new_id>/edit`，让用户 review 已保存状态 + 后续编辑。理由：避免"保存了但 URL 还停留在 /new" 的 UX 混乱。

### 7.3 U6 网络 retry 是否自动

**问题**：PRD §4.1 表说 "5xx / 网络 → '保存失败，请重试' + 不丢输入"。是否要自动 retry？

**推荐**：**不自动 retry**（minimalism + 避免重复写）。错误 banner 上有 "重试" 按钮，用户主动点。这跟 [body-editor-client.ts](v2/src/lib/body-editor-client.ts) 旧行为一致。

### 7.4 quad cells 顺序提示 (PRD §6.4.5)

**问题**：4 cell 标 `[0]左上 / [1]右上 / [2]左下 / [3]右下`。但用户**不能 swap 位置**，cell 数据完全按 array index 渲染。**要不要禁止用户在 cell.name 输入 "右上" 等位置词**？（防用户混淆数据 vs 位置）

**推荐**：**不禁止**（用户能自己写，minimalism）。位置标注靠 UI 上 [0] 标签 + ⓘ help link 提示 quad 顺序固定就够。

### 7.5 dark mode 触发条件

**问题**：[design system v1.0 tokens.css](../../../Desktop/exports%203/theme-package/tokens.css) 含明暗双模，PRD §13.5 #8 说 "Dev 加 `html.dark` 切换"。但**触发条件**？

**推荐**：跟 system pref（`prefers-color-scheme`）— 不加 toggle UI 按钮（minimalism）。Stage 4 ship 后 dark mode 是 P1 not P0。

---

## 8. Skeleton .test.ts scaffold 清单

> Dev 接力时直接填实现。**不要跑** — Dev 还在写代码，跑会全 fail。
>
> Skeleton 只含 `describe` + `test` 名 + TODO 注释 + 关键 import。每 `test` 函数体放 `expect(true).toBe(false); // TODO: implement after Dev ships <module>`。

### 8.1 计划 scaffold 文件清单（共 ~17 文件）

```
v2/tests/editor/
  state.test.ts                   §2.1   ~6 case
  api.test.ts                      §2.2   ~10 case
  dom-helpers.test.ts              §2.3   ~5 case
  format-switcher.test.ts          §2.4   ~30 case (含 20 carry-over path)
  eval-panel.test.ts               §2.10  ~6 case
  lang-tabs.test.ts                §2.11  ~5 case
  relations-panel.test.ts          §2.12  ~6 case
  help-popover.test.ts             §2.13  ~4 case
  token-no-hex.test.ts             §2.14  ~3 case
  forms/narrative.test.ts          §2.5   ~4 case
  forms/flat-list.test.ts          §2.6   ~7 case
  forms/accordion.test.ts          §2.7   ~7 case
  forms/compare.test.ts            §2.8   ~6 case
  forms/quad.test.ts               §2.9   ~7 case

v2/tests/
  kp-legacy-detector-f4.test.ts    §3.1   ~7 case
  kp-bilingual-format-refine-f5.test.ts  §3.2  ~8 case

v2/tests/e2e/
  kp-editor-u1-create.spec.ts      §4.1   ~10 case
  kp-editor-u2-edit.spec.ts        §4.2   ~6 case
  kp-editor-u3-format-switch.spec.ts §4.3 ~25 case
  kp-editor-u4-lang-tabs.spec.ts   §4.4   ~4 case
  kp-editor-u5-help.spec.ts        §4.5   ~3 case
  kp-editor-u6-error.spec.ts       §4.6   ~5 case
  kp-editor-a11y.spec.ts           §5.1   ~8 case
  kp-editor-viewport.spec.ts       §5.2   ~10 case
  kp-editor-token-swap.spec.ts     §5.3   ~5 case
```

### 8.2 接力指引（给 Dev）

1. **拿 PRD + 此 plan 平行 implement**：每个 module 写完一对应的 .test.ts 填实现，跑 vitest 局部 pass 后再下一个。
2. **F4 backend 改 [kp-legacy-detector.ts](v2/src/lib/kp-legacy-detector.ts):131-141 时**先把 `kp-legacy-detector-f4.test.ts` skeleton 转成实测，跑红 → 改 detector 让它绿。
3. **F5 改 [kp-api.ts](v2/src/schemas/kp-api.ts):32-37 时**同样用 `kp-bilingual-format-refine-f5.test.ts` 驱动。**注意翻译 supplement.test.ts 的 T2.2 / T6.3 / T8.1 reason expect**，否则会回归红。
4. **E2E 跑前**：先 `pnpm dev`（:4321）+ scripts/seed-e2e-kp.ts（待 Dev 写）插 5 fmt seed KP。
5. **viewport 测试**：playwright config 加新 project `ipad-mini`：
   ```ts
   { name: 'ipad-mini', use: { viewport: { width: 322, height: 768 }, hasTouch: true } }
   ```
6. **vitest jsdom**：在 `v2/tests/editor/` 子目录下任一 `.test.ts` 首行加 `// @vitest-environment jsdom`。`pnpm add -D jsdom`。
7. **token-no-hex 静态 grep test**：用 `child_process.execSync('grep -rE ...')` 检查 0 命中即 pass。

---

## 9. 设计阶段未覆盖（明示）

为防遗漏，列出**有意没设计**测试的部分：

- **D2=B 不做"复制 zh 起手"按钮** — DOM grep "复制" / "copy" = 0 已加（§2.11 lang-tabs.test.ts）；不写"测复制功能"反测。
- **Q6 排序按钮** — 同上，§2.6 / §2.7 / §2.9 已加 grep 0 命中。
- **Stage 5 旧列 drop** — 不在 Stage 4 scope，不测。
- **realtime preview / autosave / draft** — Q3 不做，无需测。
- **i18n UI 文案** — 编辑器 UI 中文，不测 ja/en 切换。
- **新增 endpoint** — 5 endpoint 全是 v0.8.0 已 ship，不重复测 endpoint 本身（§3 只测 F4/F5 改动 + 翻案）。
- **PRD §13.6 提的 13 条 Dev 实施待补项** — 这些是实现细节，不是 spec。Dev 实施时顺便覆盖（如 IME 保护已在 §2.3 / §2.6 列）。

---

## 10. 跨 worktree 协作注意

- **Dev Eng3 同时跑实施**：Dev 在另一 worktree 写代码 + .test.ts 实现；本 plan 只是 spec + skeleton。
- **Skeleton 文件 staged 但不 commit / 不 push**（按 PM 任务约束）。Dev 接力时把 skeleton 文件复制到自己 worktree 或 cherry-pick stage hunk。
- **PRD 不动**：碰到歧义在 §7 PM ASK 列，不修 PRD（PM 决策）。
- **scope 限制**：本 worktree 只产出 `kp-editor-v0.8-test-plan.md` + `v2/tests/editor/**` skeleton；不动 `v2/src/` 任何文件。
