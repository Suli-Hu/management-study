# PRD: KP body 结构化 schema 重构

> **目标读者**：后台研发 + 前端 + 产品
> **状态**：v0 draft，待 review。**未实施前不得开工**。
> **预估周期**：2-3 周（分 5 阶段 ship，每阶段独立可发）

---

## 1. 背景与动机

### 1.1 触发事件

v0.7.35 ship 批量 KP 编辑 API 后，老师 agent 用 batch API 改了 m178 的 `format`，导致 D1 状态：

```jsonc
{
  "format": "flat-list",   // ← API 改成了 flat-list
  "body": {
    "zh": "消费者在比较品牌时...<br>【① 线性补偿型】<br>...<br>【② 连结型】<br>..."
    //   ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
    //   但 body 里全是 accordion 风格的【】marker，不是 flat-list 的 ◆
  }
}
```

后果：
- **详情页**：`renderFlatList(body)` 找不到 `◆` → lead 检测 heuristic 失败 → 整段渲染成 6 个带序号的列表项，导语带「1」序号
- **编辑器**：`parseBody(body, 'flat-list')` 找不到 `◆` → 整个 body 塞进 `lead`、`items=[]`，编辑器条目区显示「(0)」
- **数据状态错乱无法直接修复**：除非用户手动重置 format

### 1.2 根本问题

**`format: enum` + `body: string` 是两个独立字段，但语义高度耦合**：
- format 必须与 body string 的 DSL 严格匹配，否则解析失败
- 当前架构无法在 schema 层强制这个 invariant
- v0.7.35 短期 guard（server-side 校验 body 含正确 marker）只是补丁，不是治根
- 编辑器 `changeFormat()` 用 `serialize→parse` lossy 转换 — 切 format 后旧格式数据可能残留为 lead，严重影响 UX

### 1.3 用户需求（明确表态）

> "API 严格 match 编辑器" + "几种格式只能选一个，换成 A 格式之后应该点进去编辑器里只有 A 格式，其他格式都清空才对"

→ **目标**：让 KP body 在 schema 层就是 type-safe 的 discriminated union，format 切换 = 重置 body 结构，**根本不可能**出现"format/body 不一致"或"多格式数据共存"。

---

## 2. 范围

### 2.1 in scope

- **KP** 的 `format` + `body` 字段重构为 discriminated union
- 5 种 format 的结构化 schema 定义
- 编辑器全部重写（per-format structured form）
- D1 存储 schema 调整（保留向后查询能力）
- git JSON 数据全量迁移（709 KP 文件）
- API 层 contract 重新定义
- 数据校验 round-trip（写入 = 读出 = 编辑器渲染）

### 2.2 out of scope（已 audit 确认无需改动）

| 资源 | 字段 | 现状 | 为什么不动 |
|---|---|---|---|
| **School** | `summary: {zh, ja}` | 平 prose string | 写啥读啥，无 DSL 不可能不一致 |
| **School** | `concepts: string[]` | KP id 数组 | 已结构化 |
| **Scholar** | `contribution: {zh, ja}` | 平 prose string | 同 School.summary |
| **Scholar** | `kpsOrder: string[]` | KP id 数组 | 已结构化 |
| **View** | `groups: [{id, title, flow, schoolIds[]}]` | **完全结构化** | 已经是目标形态 |
| **Discipline** | `themes: [{key, title, schools[]}]` | 已结构化 | 同 View |
| Study Session | 全部字段 | 平字段 | 不涉及 |

→ **本 PRD 仅重构 KP body**。但**契约原则适用所有资源**：API 接受的数据必须能被编辑器无损读出。

### 2.3 明确不做

- ❌ 引入 ORM（保持手写 SQL + zod schema 的当前模式）
- ❌ 改变 D1 schema 的 column 数量（body 仍单 column 存 JSON string）
- ❌ "智能" auto-convert 不同 format 之间的数据（lossy + 不可预期，由编辑器 UX 引导用户重做）
- ❌ 同时支持 string body 和结构化 body 两种 input（双轨期长 = bug 温床）

---

## 3. 新 Schema 设计

### 3.1 核心：discriminated union

```ts
// src/schemas/kp.ts (新版)

const NarrativeBody = z.object({
  format: z.literal('narrative'),
  prose: z.string(),                                    // 任意 markdown-ish prose
}).strict();

const FlatListBody = z.object({
  format: z.literal('flat-list'),
  lead: z.string().default(''),                         // 导语（可空）
  items: z.array(z.object({
    name: z.string().min(1),                            // 条目名
    desc: z.string().min(1),                            // 条目描述
  })).min(1),                                           // 至少 1 项
}).strict();

const AccordionBody = z.object({
  format: z.literal('accordion'),
  lead: z.string().default(''),
  groups: z.array(z.object({
    title: z.string().min(1),                           // 折叠组标题
    items: z.array(z.object({
      name: z.string().min(1),
      desc: z.string().default(''),
    })).default([]),                                    // 组内条目（可空）
  })).min(1),                                           // 至少 1 组
}).strict();

const CompareBody = z.object({
  format: z.literal('compare'),
  lead: z.string().default(''),
  cols: z.array(z.object({
    title: z.string().min(1),                           // 列标题
    keyword: z.string().default(''),
    desc: z.string().default(''),
    type: z.string().default(''),
    theories: z.string().default(''),
    detail: z.string().default(''),
  })).min(2),                                           // compare 至少 2 列
}).strict();

const QuadBody = z.object({
  format: z.literal('quad'),
  lead: z.string().default(''),
  yAxis: z.string().min(1),                             // y 轴标签
  xAxis: z.string().min(1),                             // x 轴标签
  cells: z.array(z.object({
    name: z.string().min(1),
    emoji: z.string().default(''),
    sub: z.string().default(''),
    detail: z.string().default(''),
  })).length(4),                                        // quad 必须 4 格
}).strict();

export const KpBody = z.discriminatedUnion('format', [
  NarrativeBody, FlatListBody, AccordionBody, CompareBody, QuadBody,
]);

export const KpEvaluations = z.object({
  meaning: z.string().default(''),     // 义
  limit: z.string().default(''),       // 限
  example: z.string().default(''),     // 例
  response: z.string().default(''),    // 应
  application: z.string().default(''), // 用
  analogy: z.string().default(''),     // 喻
}).strict();

export const Kp = z.object({
  id: KpId,
  discipline: DisciplineKey,
  schools: z.array(SchoolKey).min(1),
  scholars: z.array(ScholarKey).default([]),
  year: z.string().default(''),
  title: I18nString,                                    // 不变
  body: z.object({
    zh: KpBody,                                         // ← 替换原 string
    ja: KpBody.optional(),                              // ← 替换原 string
  }).strict(),
  evaluations: z.object({
    zh: KpEvaluations.optional(),
    ja: KpEvaluations.optional(),
  }).strict().optional(),                               // ← 拎出来独立字段（不再嵌在 body string 里）
  tags: z.array(z.string()).default([]),
  createdAt: ISO8601,
  updatedAt: ISO8601,
}).strict();
```

### 3.2 关键设计决策

#### 3.2.1 `format` 字段从顶层移到 `body.zh.format` / `body.ja.format`

理由：
- 中日双语**理论上可以是不同 format**（虽然实际惯例同步）— schema 允许
- 顶层 `format` 字段不再存在 — 所有 format 信息只在 body 里
- API 调用方写 `{ body: { zh: { format: 'flat-list', ... } } }` 一次说清楚

但实际产品策略（编辑器层）：**强制 zh.format === ja.format**（如果有 ja）。schema 允许灵活，但 UX 不暴露这个灵活性。

#### 3.2.2 `evaluations` 拎出 body 字段独立

当前 `evalContent` 已经是独立字段（`{zh: Record, ja: Record}`），但其实 body 字符串里也允许 `◆意义——XXX` 嵌入 — 解析时用 `extractEvaluations` 抽出。新设计统一：**evaluations 只能在独立字段，body 内不再允许 `◆评价——` 写法**。

迁移期处理见 §5.2。

#### 3.2.3 数组 / 对象的最小约束

| Format | 最小约束 | 理由 |
|---|---|---|
| FlatList | `items.length >= 1` | flat-list 没 items 就没意义；空表用 narrative |
| Accordion | `groups.length >= 1` | 同上 |
| Compare | `cols.length >= 2` | 单列谈不上"compare" |
| Quad | `cells.length === 4` | quad 是固定 2x2 矩阵 |

这些约束让"format/body 不一致"在 zod 层就被拒绝（不需要 server 额外 guard）。

#### 3.2.4 D1 存储策略

继续用单 column 存 body JSON string（不爆炸 column 数量），但是**存的是 `JSON.stringify(structured body)`**，不是 DSL string。

`kp` 表新增列：

```sql
-- migration 0020_kp_body_structured.sql
ALTER TABLE kp ADD COLUMN body_zh_json TEXT;       -- structured body JSON
ALTER TABLE kp ADD COLUMN body_ja_json TEXT;
ALTER TABLE kp ADD COLUMN evaluations_zh_json TEXT;
ALTER TABLE kp ADD COLUMN evaluations_ja_json TEXT;
ALTER TABLE kp ADD COLUMN body_format TEXT;        -- 冗余 cache，便于 SQL 直接 filter by format
-- 旧 body_zh / body_ja / format / eval_content_zh_json / eval_content_ja_json
-- 暂保留，过渡期后 drop
```

新 column 与旧 column **共存于过渡期**（§6 兼容性），过渡期结束后 migration 0021 drop 旧列。

#### 3.2.5 FTS 索引

`kp_fts` 仍按当前 schema (title + body 字符串)，但 body 字段改为**渲染后的纯文本**（去 marker、保留 lead/items.name/items.desc 内容拼接），让搜索仍能命中 body 内容。

序列化函数：
```ts
function bodyToSearchText(body: KpBody): string {
  if (body.format === 'narrative') return body.prose;
  let s = body.lead ?? '';
  if (body.format === 'flat-list') s += body.items.map(i => `${i.name} ${i.desc}`).join(' ');
  if (body.format === 'accordion') s += body.groups.flatMap(g => [g.title, ...g.items.flatMap(i => [i.name, i.desc])]).join(' ');
  // ...
  return s;
}
```

---

## 3.3 字段教学化文档标准（强制要求）

### 3.3.1 触发事件

教师 agent 用 v0.7.35 batch API 写 m178 时，6 个 evaluations 字段输出全部偏离原意：

| 字段 | 教师 agent 实际写的 | 字段真实语义 | 偏差类型 |
|---|---|---|---|
| 意义 | "把相关术语合成一个可直接论述的考试框架" | 该 KP 在学术 / 实务上的贡献 | 写成了 KP 元描述 |
| 局限 | "细节会随题目不同而变化，需结合案例判断" | 该 KP 理论的不足 / 边界 / 被批判 | 写成了答题注意事项 |
| 例子 | "适合在论述题中作为分类轴使用" | 真实企业案例 / 事例 | 写成了用途说明 |
| 应对 | "用于解释概念关系、比较类型并连接企业案例" | 基于 KP 的应对策略 / 处方 | 写成了用法描述 |

→ agent 把所有字段都当成"如何用这个 KP 答题"，证明 **API 文档没把字段语义教清楚**。当前文档只写：

```markdown
| `evalContent.zh` | — | object | `{义,限,例,应,用,喻}` 结构化评价（中文） |
```

→ 只列了 key 名，没定义每个 key 是什么。

### 3.3.2 标准（适用所有字段，不只 evaluations）

任何**有歧义可能**的字段，API 文档必须含：

1. **定义**：一句话描述该字段表达什么
2. **对例**：1-2 个写得好的真实示例
3. **错例**：1-2 个常见错写，配"为什么不对"
4. （可选）**与相邻字段的区分**：避免概念混淆（如"应对"vs"应用"）

例（evaluations.meaning 字段）：

```markdown
### `evaluations.zh.meaning`（义 — 意义）

**定义**：该 KP 在学术史 / 实务上的贡献和价值，回答"这个理论为什么重要"。

**对例**：
- "首次系统化提出消费者非理性选择行为的认知模型，挑战古典经济学完全理性人假设。"
- "把企业战略与组织能力对齐写成可操作框架，是战略落地理论的奠基。"

**错例**：
- ❌ "把相关术语合成一个可直接论述的考试框架。" — 这是 KP 元描述，不是理论意义
- ❌ "适合在期末论述题中使用。" — 这是 KP 用法，不是理论意义

**与"应用"区分**：意义 = 学术/实务贡献（why important），应用 = 实务场景（when used）。
```

### 3.3.3 实施

**短期已完成**（v0.7.36 ship 同时完成）：
- ✅ 新建 [`v2/public/docs/kp-field-guide.md`](../public/docs/kp-field-guide.md) — KP 全字段教学（format 选择指南 + body 内字段 + evaluations 6 字段 + compare 6 列详解 + quad 详解 + 关联字段）
- ✅ api-reference.md §3.1 KP 字段表加引导块 → guide
- ✅ api-reference 不再保留字段语义教学（单一真源原则，仅在 guide 维护）

**PRD 落地阶段同步**：
- 5 format 的新 schema 字段（FlatListBody.lead / AccordionBody.groups / CompareBody.cols / QuadBody.cells 等）必须更新 [kp-field-guide.md](../public/docs/kp-field-guide.md) 对应小节
- **zod schema 用 `.describe()` 标注**：每个有定义需要的字段在 schema 上挂 description，未来 OpenAPI 自动生成可读出
- 编辑器 form 字段加 inline help 直接 link 到 guide 对应小节

**未来扩展**：把这套教学化标准复用到 School / Scholar 字段（虽然它们当前不需要 schema 重构，但教学化文档可以补）— 单独排期

### 3.3.4 责任人

- 写新字段 = 必须含教学（review 时检查）
- 改字段语义 = 必须更新所有 3 个层面：zod `.describe()` + api-reference.md + 相关 PRD/wiki

---

## 4. API contract 变化

### 4.1 写入 endpoints 全部接受新 schema

| Endpoint | 当前 | 新 |
|---|---|---|
| `POST /api/kps` | `{ body: { zh: string }, format: enum, ... }` | `{ body: { zh: KpBody }, ... }`（无顶层 format） |
| `PATCH /api/kps/:id` | 同上 partial | partial — patch.body.zh 是完整新 KpBody |
| `PATCH /api/kps/batch` | KpBatchPatchInput | 调整：`body.zh` 是完整 KpBody（**不能 shallow merge body 内部**） |

### 4.2 Shallow merge 在新 schema 下的语义

当前 v0.7.35 batch API 的 shallow merge：title/body/evalContent 第 1 层 merge。

新 schema 下：
- `title` 仍 shallow merge {zh, ja, en}
- `body.zh` 是 discriminated union — **整体替换**，不再 shallow merge（merge 一个 NarrativeBody 进 FlatListBody 类型不安全）
- `evaluations.zh` 仍 shallow merge {meaning, limit, ...}

新 contract：
```jsonc
// 只想改中文 body：
{ "body": { "zh": { "format": "flat-list", "lead": "...", "items": [...] } } }
// → ja 保留，zh 完全替换

// 只想改中文标题：
{ "title": { "zh": "新标题" } }
// → ja/en 保留（shallow merge 仍生效）
```

如果用户只想改 body 中的某项（如 flat-list 的第 3 个 item），需要先 GET → 改 → PATCH 完整 body。**未来可加** `BatchKpItemPatchInput` 支持更细的局部更新（不在本 PRD scope）。

### 4.3 新增 endpoint

```
GET /api/kps/empty-body?format=flat-list
```

返回该 format 的空白 body 模板，给编辑器初始化新 KP / 切 format 时用。

```json
{
  "ok": true,
  "body": { "format": "flat-list", "lead": "", "items": [{ "name": "", "desc": "" }] }
}
```

### 4.4 错误码新增

| HTTP | reason | 触发 |
|---|---|---|
| 422 | `body_format_invalid` | body discriminator 不在 5 种合法值 |
| 422 | `body_structure_invalid` | body 结构不符合该 format 的 zod schema |

旧的 `body_format_mismatch`（v0.7.36 短期 guard 用的）**不再需要** — 在新 schema 下不可能不一致。

---

## 5. 数据迁移（700+ KPs）

### 5.1 迁移方向

**原 string body** → 用 `parseBody(string, oldFormat)` 解析 → 重新 serialize 成结构化 JSON。

```ts
// scripts/migrate-kp-body-structured.ts
for (const f of allKpJsonFiles) {
  const old = JSON.parse(readFileSync(f));
  const oldBody = old.body.zh;
  const oldFormat = old.format;

  const parsed = parseBody(oldBody, oldFormat);  // 复用现有 parser
  const newBodyZh = parsedToStructured(parsed);  // 转 discriminated union JSON

  const newKp = {
    ...old,
    body: { zh: newBodyZh, ja: old.body.ja ? parsedToStructured(parseBody(old.body.ja, oldFormat)) : undefined },
    evaluations: { zh: parsed.evaluations, ... },
  };
  delete newKp.format;  // 顶层 format 移走
  delete newKp.evalContent;  // evalContent 改名 evaluations 且抽出

  writeFileSync(f, JSON.stringify(newKp, null, 2));
}
```

### 5.2 迁移期 edge cases

| 情况 | 处理 |
|---|---|
| body 为空但 format 是结构化（已知数据中有少量） | 写入 `{ format: 'narrative', prose: '' }`，加 `migration_note: 'body_was_empty'` 字段标记 |
| body 含旧 `◆评价——` 但 format 不识别 | 提取 evaluations 后剩余字符当 narrative.prose |
| body 解析后 items.length === 0（同 m178） | 强制改 format 为 narrative，prose 为整段原文 + migration_note |
| body 含未知 marker | narrative + 原文保留 |

**迁移脚本必须输出 report**：
```
709 KPs scanned
  693 migrated cleanly
  12 forced to narrative (body_format_mismatch)
  4 had migration_notes (review needed)
```

人工 review 12+4 个边界 case，必要时手动 fix。

### 5.3 D1 数据迁移

migration 0020 加新 column 后，跑一次性 backfill：
- 读 `body_zh + format + eval_content_zh_json` (旧)
- parseBody → 结构化
- 写 `body_zh_json + body_ja_json + body_format + evaluations_*_json` (新)

backfill 完成后旧列保留至 §6 hard cut。

---

## 6. 兼容性与过渡策略

### 6.1 阶段化 ship

| Stage | 周期 | 内容 | 上线后状态 |
|---|---|---|---|
| **0. 准备** | 2 天 | 新 schema 文件、KpBody type、空白模板 helper | 类型定义就绪，无运行时影响 |
| **1. D1 schema** | 1 天 | migration 0020 加新 column + backfill 脚本 + 跑一次 backfill | D1 双写：旧 column + 新 column 都有数据 |
| **2. 渲染层切新 column** | 2 天 | 详情页 / 列表页 / 学派页全部改读新 column；写一个 structured→html 的新 renderer 替换 render-body.ts | 渲染走新数据，旧 renderer 留作 fallback |
| **3. API contract 切换** | 3 天 | POST/PATCH/batch 端点改接受 KpBody discriminated union；旧 string body 输入返 422 + 提示 "API contract changed in v0.8.0, see /docs/migration-v0.8.md" | API hard cut（无双轨） |
| **4. 编辑器重写** | 5 天 | 5 个 per-format form 组件；切 format 时清空旧数据 + 弹 confirm；body-editor-client.ts 重写 | 编辑器走新 schema |
| **5. 数据迁移收尾** | 1 天 | git JSON 全量迁移脚本跑一次 + commit；migration 0021 drop 旧 column | 旧字段彻底清理 |

总计 **~14 工作日**（含每阶段必须的测试 + PR review 时间）。

### 6.2 hard cut vs soft compat

**选择 hard cut**：
- API contract v0.8.0 起只接受新 schema。旧调用方一次性切。
- 理由：双轨期 = bug 温床（v0.7.35 m178 就是 lossy 转换的副作用）；老师 agent 是主要调用方，沟通成本可控

**Soft 部分**：
- D1 column 双写（Stage 1-5）期间，渲染降级到旧 column 仍可用 — 这是数据层的 soft，不是 API 层的 soft

### 6.3 双写过渡的 3 道防线（保证最终切到新列，不会"无限期降级到旧列"）

双写不是"两套渲染并存"—— 是**单向迁移过程**。3 道防线保证迁移**真的会完成**：

#### 防线 1：Stage 2 起渲染层**默认读新列**（旧列仅作 fallback 救命）

```ts
// 渲染代码 from Stage 2 onward
const bodyJson = kp.body_zh_json;
if (!bodyJson) {
  // 仅在新列写失败的极端情况下兜底，并立即上 sentry 告警
  console.warn('[KP_RENDER_FALLBACK] new column empty, falling back to legacy', kp.id);
  return renderLegacyBody(kp.body_zh, kp.format);
}
return renderStructuredBody(JSON.parse(bodyJson));
```

**关键**：默认行为是新列；fallback 触发 = 双写有 bug（监控告警），不是"两套等价二选一"。

#### 防线 2：Stage 4 加双写漂移检测（CI / scheduled job）

```ts
// scripts/check-kp-double-write-drift.ts
// 抽 100 条 KP 对比 parseBody(body_zh, format) vs JSON.parse(body_zh_json)
// 不一致 → 失败 + 列出哪些 id 漂移
for (const kp of sample(100)) {
  const fromLegacy = legacyParse(kp.body_zh, kp.format);
  const fromNew = JSON.parse(kp.body_zh_json);
  assert(structurallyEqual(fromLegacy, fromNew), `drift on ${kp.id}`);
}
```

每天定时跑 + 每次 deploy 跑。**双写漏洞被立即暴露**，不会悄悄漂移几周后才发现。

#### 防线 3：Stage 5 **物理 drop 旧列**（终极保证）

```sql
-- migration 0021_kp_drop_legacy_columns.sql
ALTER TABLE kp DROP COLUMN body_zh;
ALTER TABLE kp DROP COLUMN body_ja;
ALTER TABLE kp DROP COLUMN format;
ALTER TABLE kp DROP COLUMN eval_content_zh_json;
ALTER TABLE kp DROP COLUMN eval_content_ja_json;
```

旧列**物理消失**。任何想读旧列的代码（包括防线 1 的 fallback 分支）会**编译时报错**或**SQL fail**。

→ **承诺**：从 Stage 2 起用户看到的就是新渲染。Stage 5 drop 旧列后**不可能回头**。

#### 时间线可视化

```
Stage 1 (Day 1)         加新列 + 双写开始（渲染仍读旧列，因新列还是空）
Stage 1 backfill        旧列 → 新列填一遍（跑 1 次脚本，~1 min）
Stage 2 (Day 2-3)       渲染切到读新列（旧列降为"保险箱"，平时不读）
Stage 3-4 (Day 4-12)    API contract 切 + 编辑器重写
Stage 4 漂移监控        每天验证旧列 parse vs 新列一致
Stage 5 (Day 13-14)     物理 drop 旧列 → 切断退路
```

### 6.4 老师 agent / 外部调用方迁移

新增 `v2/public/docs/migration-v0.8.md`：
- 旧 vs 新 API contract 对比
- 5 种 format 的写入示例
- 常见错误及 fix
- 工具：`POST /api/kps/empty-body?format=...` 拿模板起手

---

## 7. 编辑器新形态

### 7.1 核心交互

```
┌─────────────────────────────────────┐
│ format: [narrative ▼]               │ ← 下拉选 format
│         [flat-list]                 │
│         [accordion]                 │
│         [compare]                   │
│         [quad]                      │
├─────────────────────────────────────┤
│ ┌─ 切 format 弹窗 ──────────┐      │
│ │ ⚠️ 切换 format 会清空当前  │      │
│ │ "flat-list" 的 5 条 items │      │
│ │ 和导语。是否继续？        │      │
│ │      [取消]  [确认切换]    │      │
│ └────────────────────────────┘      │
├─────────────────────────────────────┤
│ [当前 format 的 structured form]    │ ← per-format 不同
└─────────────────────────────────────┘
```

### 7.2 5 个 per-format form 组件

| Format | UI |
|---|---|
| **narrative** | 单一 textarea (markdown-friendly) |
| **flat-list** | 导语 textarea + 条目列表（每条 [name input, desc textarea, 删除]，底部"+ 添加条目"） |
| **accordion** | 导语 textarea + 折叠组列表（每组 [title input + 嵌套 items 列表]，底部"+ 添加组"） |
| **compare** | 导语 textarea + 列表格（每列 6 个 input：title/keyword/desc/type/theories/detail）+ 横向滚动 |
| **quad** | 导语 textarea + yAxis/xAxis input + 2x2 grid（每格 [name/emoji/sub/detail]） |

加 evaluations panel（独立于 body form）：6 个 textarea (义/限/例/应/用/喻) × 2 语种 (zh/ja)。

### 7.3 解决用户痛点（"切 format 残留旧数据"）

新设计：
1. 切 format 触发 confirm dialog（除非新旧都为空）
2. 用户确认 → body 重置为新 format 的 emptyBody（来自 §4.3 endpoint 或本地 helper）
3. 旧数据**真正丢弃**，不再 lossy 转换
4. 清空时不涉及 lead/evaluations — 这两个独立保留

---

## 8. 风险与缓解

| 风险 | 缓解 |
|---|---|
| 编辑器 5 个 form 重写工程量大 | Stage 4 单独排期 5 天；用 frontend-design skill 辅助 UI 设计 |
| 数据迁移 12+ 个 forced narrative case | 迁移脚本输出 report，人工 review；提供"恢复 structured"的 admin tool |
| 老师 agent 工作流被打断 | Stage 3 切换前 1 周给老师 agent 发 migration guide + 演示新 API 用法 |
| FTS 索引重建漫长 | 跟 backfill 同步跑，709 KPs 量小预估 < 1min |
| body 内嵌 `◆评价——` 残留旧数据冲突 | 迁移脚本明确处理：抽出到 evaluations 字段，body 内不再保留 |
| v0.7.35 batch API 调用方代码已经存在 | hard cut at v0.8.0 + migration guide；调用方一次性切，不留历史包袱 |
| 切 format confirm 弹窗多次操作烦 | 新建 KP 第一次选 format 不弹；只在 body 已有内容时才弹 |
| 测试覆盖面增加 | 每个 format × CRUD × dryRun 组合 = 5×4×2 = 40 个 case，设计 parameterized test |

---

## 9. 测试要求

### 9.1 schema 层

- 5 个 format 各自的 zod parse happy path
- 各种 invalid input：format 不在枚举、structure 不符、min/max 违反
- discriminated union 的拒绝路径

### 9.2 数据迁移

- 跑 prod 数据 dry-run，输出 report
- 边界 case：空 body、body 含旧 ◆评价、quad 数据少于 4 cell 等
- round-trip：迁移后 → 渲染 HTML → 跟旧 renderer HTML 对比（按节点数 / 关键文本，不要求字节相同）

### 9.3 API 层

- POST/PATCH/batch 各 5 format × 写入成功 = 15+ case
- 拒绝路径：旧 string body 提交、format 与 structure 不匹配
- batch dryRun 仍能 diff（结构化对象的 diff 要算 structured diff）

### 9.4 编辑器

- E2E：每 format 创建 KP → 保存 → 重新打开 → 数据完整
- 切 format → confirm → 数据清空验证
- 中日双语切换不丢数据

---

## 10. 工程量

| Stage | 工作内容 | 人 × 天 |
|---|---|---:|
| 0 | Schema + types + helper | 2 |
| 1 | D1 migration + backfill 脚本 + 跑 backfill | 1 |
| 2 | 新 renderer + 切渲染层读新 column | 2 |
| 3 | API endpoints 切 contract + migration guide doc | 3 |
| 4 | 5 form 组件 + body-editor-client 重写 + UX (frontend-design skill) | 5 |
| 5 | git JSON 全量迁移 + commit + 旧 column drop migration | 1 |
| | **总计** | **14 工作日** |

按单人 = 3 周。可并行的是 Stage 0/1（基础）跟 Stage 4 准备（编辑器原型可同步设计）— 可能压到 2.5 周。

---

## 11. 上线 checklist

- [ ] Stage 0-5 各阶段独立 PR + merge
- [ ] 跑 prod 数据 dry-run migration，report 输出可读，人工 review 边界 case 全部 fix
- [ ] 5 format × CRUD × dryRun 全套测试通过
- [ ] 新编辑器手工 QA：每 format 创建 / 编辑 / 切 format / 保存
- [ ] 老师 agent 拿 migration-v0.8.md + 真实跑过一次 batch API（用新 contract）
- [ ] FTS 搜索仍能命中 body 内容（snapshot test）
- [ ] migration 0021 drop 旧 column（最终阶段）
- [ ] CHANGELOG / README 更新

---

## 12. 后续扩展（不在本 PRD）

排队等待，**不混进本重构**：

1. body 局部更新（如只改 flat-list 第 3 个 item 而不重发整个 items）
2. body 历史 diff 查看（结构化 diff 比 string diff 更可读）
3. 编辑器实时预览（左编辑右渲染）
4. body 模板库（用户保存常用 flat-list / accordion 结构作模板）
5. 把这套 contract 严格化模式推广到 School/Scholar（虽然它们当前没问题，但作为统一标准可以有一份对应 PRD）

---

## 13. 决策点（已 confirm，可开工）

**Status：CONFIRMED** ✅ 6/6 决策点已 align（产品 + 架构 review 2026-05-03）

| # | 决策 | 选择 | 选 PRD §|
|---|---|---|---|
| 1 | `format` 字段位置 | **body 内** | §3.2.1 |
| 2 | D1 column 策略 | **双写过渡 + 最终 drop** + 3 道防线 | §3.2.4 + §6.3 |
| 3 | API contract 切换 | **hard cut at v0.8.0** | §6.2 |
| 4 | evaluations 字段位置 | **独立顶层字段**，body 内不再允许 `◆评价——` | §3.2.2 |
| 5 | quad cells 数量 | **严格 4**，但实施前先 audit 现有 4 个 quad KP 数据 | §3.1 |
| 6 | stage 顺序 | **严格串行**（单人开发，质量优于工期） | §6.1 |

**新增上线前必做**（基于决策 #5）：
- [ ] **audit 4 个现有 quad KP**：`for f in data/*/kp/*.json; jq 'select(.format=="quad") | {id, cells_len: (.body.zh | ...)}'`，确认每个都是 4 cells；不是 4 的先手动修
- [ ] migration 0020 写入前再跑一次 audit，防止用户期间又创建了非 4 cell 的 quad

**下一步**：本 PRD 进入 confirmed 状态，可单独排期 implement v0.8.0（不在本 docs PR 范围）。

---

**心智模型提醒**（写给实现者）：

> 这个重构的**唯一 invariant**：API 接受了什么 = 编辑器能完整读出什么 = 渲染层能正确显示什么。
> 三者必须 **byte-for-byte round-trip**（除了服务端注入的 `updatedAt` 等元数据）。
> 任何打破这个 invariant 的设计都要拒绝。
