# PRD: 批量 KP 局部编辑 API（v2）

> **目标读者**：后台研发 agent。
> **背景输入**：老师 agent 提的批量编辑需求 + 产品 + 架构评估 + 老师 v1 反馈。
> **状态**：v0.7.35 已 ship；v0.8.0 Stage 3 hard cut 已对齐 KP body 结构化 contract（详见 [migration-v0.8.md](../public/docs/migration-v0.8.md) + [KP-BODY-STRUCTURED-PRD.md](KP-BODY-STRUCTURED-PRD.md)）。
> **变更历史**：
>   - v0.7.35 — title/body/evalContent 改为浅 merge；dryRun 总返 current_version；加推荐 workflow；明确数组空值语义。
>   - **v0.8.0 Stage 3 — KP body / format / evalContent contract hard cut**（本 PRD 已同步）：
>     * 顶层 `format` 字段移除（迁到 `body.{zh,ja}.format`）
>     * `body.zh / body.ja` 从 string DSL 改为 `KpBody` discriminated union（5 format 各自结构化字段）
>     * `evalContent` 改名 `evaluations`，6 子 key 中文汉字 → 英文（`meaning/limit/example/response/application/analogy`）
>     * `body.{zh,ja}` 单语种内部不再 deep merge（discriminated union 跨 format 不安全 — 整体替换 KpBody）
>     * `evaluations.{zh,ja}` 整体替换（不深 merge 到子 key 一级）
>     * 旧 contract payload → 单条 `results[]` 返 `legacy_top_level_format` / `legacy_string_body` / `legacy_evalcontent_field` / `legacy_eval_in_body`，不影响其它条
>     * 新增 `body_format_invalid`（discriminator 错）+ `body_structure_invalid`（结构错）取代旧 `body_format_mismatch`

## 1. 背景与动机

知识库运营场景下经常需要批量整理：标题瘦身（"X·Y·Z·W" → "X"）、归属清理（schools/scholars 重新分配）、tags 批量归类、format 切换。

当前以单张 KP 为单位调 `PATCH /api/kps/:id`，50-100 张规模时：
- 网络往返 50-100 次，整体 30s+
- 失败排查难（哪张失败、为什么失败需逐条看）
- 缺乏"先看会改什么再决定提交"的安全门
- 多人编辑场景下后写覆盖前写无任何保护

## 2. 范围

### 2.1 做什么

新增单一端点：

```
PATCH /api/kps/batch
```

支持：
- 一次提交 ≤ 50 条 KP 的局部更新
- 必须支持 dryRun 模式（返 diff，不写入；只要 KP 存在永远返 `current_version`）
- 必须支持乐观锁（`ifMatchVersion`，conflict 返 409）
- 逐条独立结果，不强行整批事务
- 字段白名单（不允许批量改 id/discipline/createdAt/updatedAt/version）
- **嵌套对象字段（title/body/evalContent）shallow merge 语义**

### 2.2 不做什么

明确不在 MVP 范围：

| 不做的事 | 理由 |
|---|---|
| `PATCH /api/edit/kps/batch`（走 git+D1 双写路径） | 该路径已 deprecated（v0.7.32 文档明确），不再扩展 |
| `POST /api/v1/sync/kp/.../batch`（批量 git→D1 同步） | API-first 直接写 D1 = 完成，没有"sync"步骤 |
| 数组字段的 `addSchools/removeSchools/addTags/removeTags` 增量操作 | MVP 用整体替换语义；增量操作可作为 v2 扩展 |
| 异步 job 模式（提交→返 jobId→轮询） | 50 条以内同步执行可控 |
| 100 条上限 | 第一版稳定后再放，先 50 条 |
| 单独 batch sync 接口 | API-first 不需要 |
| 把单条 `PATCH /api/kps/:id` 也升级为 merge 语义 | 影响现有调用方，本 MVP 不做；v2 时统一 |

## 3. 接口设计

### 3.1 请求

```http
PATCH /api/kps/batch?discipline=marketing
Authorization: Bearer ms_v1_xxx
Content-Type: application/json
```

请求体：

```json
{
  "dryRun": false,
  "updates": [
    {
      "id": "m166",
      "ifMatchVersion": 3,
      "patch": {
        "title": { "zh": "价格设定流程" },
        "year": "1980",
        "schools": ["pricing_strategy"],
        "tags": ["pricing process", "Kotler"]
      }
    },
    {
      "id": "m178",
      "ifMatchVersion": 7,
      "patch": {
        "title": { "zh": "..." }
      }
    }
  ]
}
```

字段说明：

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `dryRun` | 否（默认 false） | boolean | true = 验证 + 计算 diff 但不写入 |
| `updates` | 是 | array | 1-50 条 patch 项 |
| `updates[].id` | 是 | string | KP id |
| `updates[].ifMatchVersion` | dryRun 模式可省；非 dryRun 必传 | int | 调用方上次读到的 version；不一致返 `version_conflict` |
| `updates[].patch` | 是 | object | 局部更新字段；schema = `KpBatchPatchInput`（**非现有 KpPatchInput**，详见 §3.2） |

### 3.2 patch 字段语义（关键 — 跟单条 PATCH 不同）

> **v0.8.0 Stage 3 起**：`KpBatchPatchInput` 与单条 `KpPatchInput` 共享 partial-by-language 语义（题外话：v0.7.x 单条 PATCH 是整体替换，v0.8.0 起统一升级）。

`KpBatchPatchInput`（[`v2/src/schemas/kp-batch-api.ts`](../src/schemas/kp-batch-api.ts)）字段：

| 字段 | 类型 | 语义 |
|---|---|---|
| `title` | `{zh?, ja?, en?}` 任意子集 | 按语种 shallow merge — 缺省语种保留原值 |
| `body` | `{zh?: KpBody, ja?: KpBody}` 任意子集 | 按语种 shallow merge — 缺省语种保留原值；**单语种内部 KpBody 整体替换**（不能跨 format 深 merge） |
| `evaluations` | `{zh?: KpEvaluationsLang, ja?: KpEvaluationsLang}` 任意子集 | 按语种 shallow merge — 缺省语种保留原值；**单语种内部 6 字段 Record 整体替换** |
| `year` | string | replace |
| `schools` | string[] | replace（至少 1 个） |
| `scholars` | string[] | replace |
| `tags` | string[] | replace |

#### 3.2.1 嵌套对象字段：按语种 shallow merge

```jsonc
// 现有 KP
{ "title": { "zh": "旧标题", "ja": "旧タイトル", "en": "Old Title" } }

// 提交 patch
{ "title": { "zh": "新标题" } }

// 实际写入结果
{ "title": { "zh": "新标题", "ja": "旧タイトル", "en": "Old Title" } }
//          ^^^^^^^^^^^^^   <-- 只改 zh，ja/en 保持原值
```

#### 3.2.1a body 单语种整体替换（v0.8.0 关键变化）

```jsonc
// 现有 KP
{ "body": {
    "zh": { "format": "flat-list", "lead": "L", "items": [{"name":"A","desc":"a"}] },
    "ja": { "format": "flat-list", "lead": "L-ja", "items": [{"name":"Aja","desc":"aja"}] }
} }

// ❌ 不能这样写：
{ "body": { "zh": { "items": [{"name":"B","desc":"b"}] } } }
// → 该条 422-style results[]：reason=body_structure_invalid（zh 不是合法 KpBody — 缺 format / 缺 lead）

// ✅ 必须整体重写 zh：
{ "body": {
    "zh": {
      "format": "flat-list",
      "lead": "L",
      "items": [{"name":"A","desc":"a"},{"name":"B","desc":"b"}]
    }
} }
// → ja 保留，zh 整体替换
```

调用方若想"加一个 item"，必须先 GET 拿当前 body.zh → 本地改 → 整体回写。详见 [migration-v0.8.md §5](../public/docs/migration-v0.8.md#5-patch-语义变化body-不再-shallow-merge)。

#### 3.2.1b evaluations 单语种 Record 整体替换

```jsonc
// 现有
{ "evaluations": {
    "zh": { "meaning": "...", "limit": "...", "example": "..." },
    "ja": { "meaning": "..." }
} }

// patch
{ "evaluations": { "zh": { "meaning": "新", "response": "新" } } }

// 写入结果（zh 整体替换；ja 保持）
{ "evaluations": {
    "zh": { "meaning": "新", "response": "新" },  // <-- limit/example 没了！
    "ja": { "meaning": "..." }
} }
```

调用方若想保留 `evaluations.zh.limit`，必须连 `limit` 一起传。理由同 v0.7.x：避免 merge 深度无界 — 单字段 merge 让 schema 复杂化。

#### 3.2.2 数组字段：整体替换；空数组 = 真清空

`schools` / `scholars` / `tags` 是数组，**整体替换**：

| 操作 | 含义 |
|---|---|
| `"schools": ["a", "b"]` | 替换为 `["a", "b"]` |
| `"scholars": []` | **真清空**（写入 D1 后 KP 无关联学者） |
| `"tags": []` | **真清空** |
| 不传 `schools` 这个 key | **保持原值不动** |
| `"schools": []` | **会被 zod 拒**（KP schema 规定 schools 至少 1 个） |

注意区分"不传 key" vs "传空数组" —— 这两个语义完全不同。前者忽略，后者清空。

#### 3.2.3 标量字段：整体替换

`year` 是标量，传了即覆盖。空字符串 `""` 也算合法值。

> v0.8.0 起 `format` 已不在 batch patch 顶层（移到 `body.{zh,ja}.format`）— 写了 `format` 顶层会返 `forbidden_field`，详见 §3.2.5。

#### 3.2.4 完整字段表（v0.8.0）

| 字段 | 类型 | 语义 | 备注 |
|---|---|---|---|
| `title` | `{zh?, ja?, en?}` | shallow merge by language | 子 key 至少 1 个 |
| `body` | `{zh?: KpBody, ja?: KpBody}` | shallow merge by language；KpBody 内整体替换 | 子 key 至少 1 个；KpBody 见 [kp-body-structured.ts](../src/schemas/kp-body-structured.ts) |
| `evaluations` | `{zh?: KpEvaluationsLang, ja?: KpEvaluationsLang}` | shallow merge by language；KpEvaluationsLang Record 整体替换 | KpEvaluationsLang = `{meaning, limit, example, response, application, analogy}` 6 字段 |
| `year` | string | replace | |
| `schools` | string[] | replace | 至少 1 个；必须属于该 tenant |
| `scholars` | string[] | replace | 可空；必须属于该 tenant |
| `tags` | string[] | replace | 可空 |

#### 3.2.5 禁止字段

写了立即返 `forbidden_field`（不 merge、不替换、整条 patch 失败）：

`id` / `discipline` / `createdAt` / `updatedAt` / `version` / `tenant_id` / `created_by` / `updated_by`

**v0.8.0 起额外禁止**（旧 contract 字段，写了返 `forbidden_field`）：

`format` / `evalContent`

### 3.3 成功响应（非 dryRun）

```json
{
  "ok": true,
  "tenant": { "tenantId": "marketing", "discipline": "marketing", "role": "editor" },
  "summary": {
    "total": 50,
    "succeeded": 48,
    "failed": 2
  },
  "results": [
    {
      "id": "m166",
      "ok": true,
      "version": 4,
      "changed_fields": ["title.zh", "year", "schools", "tags"]
    },
    {
      "id": "m178",
      "ok": false,
      "reason": "version_conflict",
      "current_version": 9,
      "expected_version": 7
    },
    {
      "id": "m999",
      "ok": false,
      "reason": "kp_not_found"
    }
  ]
}
```

`results[]` 顺序与请求 `updates[]` 顺序一致。

`changed_fields` 用**点路径**表示（`title.zh` 而不是 `title`），让调用方知道嵌套对象具体改了哪个 sub-key。数组字段没有点路径（直接 `schools`、`tags`）。

### 3.4 dryRun 响应

```json
{
  "ok": true,
  "dryRun": true,
  "tenant": { "tenantId": "marketing", "discipline": "marketing", "role": "editor" },
  "summary": {
    "total": 50,
    "would_succeed": 48,
    "would_fail": 2
  },
  "results": [
    {
      "id": "m166",
      "ok": true,
      "current_version": 3,
      "diff": {
        "title.zh": { "before": "价格设定流程·目标·需求·成本·竞争·方法·最终价格", "after": "价格设定流程" },
        "year": { "before": "", "after": "1980" },
        "schools": { "before": ["pricing", "marketing_general"], "after": ["pricing_strategy"] }
      }
    },
    {
      "id": "m999",
      "ok": false,
      "reason": "kp_not_found"
    },
    {
      "id": "m200",
      "ok": false,
      "reason": "school_not_in_tenant",
      "current_version": 5,
      "detail": { "invalid_keys": ["nonexistent_school"] }
    }
  ]
}
```

#### 3.4.1 `current_version` 返回规则（v2 关键修订）

**只要 KP 存在，`current_version` 就必须返**，无论 patch 是否合法。

| 情况 | 返 `current_version` ? |
|---|---|
| KP 存在，patch 合法 | ✅ 返 |
| KP 存在，patch 校验失败（`forbidden_field` / `school_not_in_tenant` / `invalid_patch`） | ✅ 返 |
| KP 存在但跨 tenant (`kp_not_in_tenant`) | ❌ 不返（拒绝泄露跨 tenant 信息） |
| `kp_not_found` | ❌ 不返（无 version 可拿） |

理由：调用方修了 patch 后想直接重提，不用再 GET。

#### 3.4.2 diff 计算规则

- **标量字段（year/format）**：`{ before, after }`
- **嵌套对象字段（title/body/evalContent）**：以**点路径展开**成多条 diff，**只列被 merge 改动的子 key**。例：patch `title: { zh: "新" }` → 只产生 `title.zh` 一条 diff，不会出现 `title.ja` / `title.en`（因为它们没被改）
- **数组字段**：整体 before/after，不算"加了哪几个、删了哪几个"
- **没变的字段不出现在 diff 里**（哪怕 patch 里传了同值）

### 3.5 整体错误（非逐条）

| HTTP | reason | 触发条件 |
|---|---:|---|
| 400 | `body_must_be_json` | 请求体不是合法 JSON |
| 400 | `discipline_required` | 缺 `?discipline=` |
| 400 | `updates_empty` | `updates` 长度 0 |
| 400 | `too_many_items` | `updates` 长度 > 50 |
| 401 | `not_authenticated` | 未带 token / token 无效 |
| 403 | `not_editor` | 该 tenant 无写权限 |
| 404 | `tenant_not_found` | discipline 不存在 |
| 422 | `schema_invalid` | 整个 body 形状不对（如 `updates` 不是 array） |
| 413 | `payload_too_large` | 请求体 > 1MB |

注意：**单条 patch 的 zod 校验失败不返整体 422**，而是该条返 `invalid_patch` 在 `results[]` 里。

### 3.6 逐条 reason（在 `results[].reason`）

| reason | 含义 | 是否返 `current_version` |
|---|---|---|
| `kp_not_found` | id 不存在 | ❌ |
| `kp_not_in_tenant` | KP 存在但不属于当前 discipline | ❌ |
| `version_conflict` | `ifMatchVersion` ≠ 当前 version | ✅ + `expected_version` |
| `ifMatchVersion_required` | 非 dryRun 且未传 ifMatchVersion | ✅ |
| `forbidden_field` | patch 含禁止字段（detail 给字段名）；v0.8.0 起含 `format` / `evalContent` | ✅（同 tenant 才返） |
| `school_not_in_tenant` | schools 引用了非本 tenant 的 key（detail 给 invalid_keys） | ✅ |
| `scholar_not_in_tenant` | scholars 引用了非本 tenant 的 key（detail 给 invalid_keys） | ✅ |
| `body_format_invalid` | **v0.8.0** body discriminator 不在 5 种合法值（如 `body.zh.format = "list"`） | ✅（同 tenant 才返） |
| `body_structure_invalid` | **v0.8.0** body 形状对得上 format 但内部字段不合法（如 quad cells != 4，flat-list items 空，缺必填字段等） | ✅（同 tenant 才返） |
| `legacy_top_level_format` | **v0.8.0** patch 含顶层 `format` 字段（旧 contract） | ✅（同 tenant 才返），detail 含 `migration_guide` URL |
| `legacy_string_body` | **v0.8.0** `body.zh` 或 `body.ja` 是 string 而非 KpBody object | 同上 |
| `legacy_evalcontent_field` | **v0.8.0** patch 含 `evalContent` key（应改名 `evaluations` 且子 key 英化） | 同上 |
| `legacy_eval_in_body` | **v0.8.0** body 内含 ◆评价—— 段（应独立写到 evaluations 字段） | 同上 |

### 3.7 推荐 Workflow

批量编辑的标准 3-step 链路：

```
Step 1. dryRun (不带 ifMatchVersion)
    ↓
   服务端返 results[].diff + results[].current_version
    ↓
Step 2. 调用方人工/自动 review diff
    ↓
   决定：哪些条接受、哪些条修改、哪些条丢弃
    ↓
Step 3. 真实 PATCH (带从 Step 1 拿到的 ifMatchVersion)
    ↓
   服务端逐条校验 version → 写 D1
    ↓
   返 summary + 逐条 results
```

为什么这样：

1. **dryRun 不要 ifMatchVersion** — 还没决定改不改，没必要先 query 一次 version
2. **真实 PATCH 必须带 ifMatchVersion** — 防止 dryRun 到提交之间被别人改了（默默覆盖别人的改动）
3. **dryRun 返的 `current_version` = 真实 PATCH 的 ifMatchVersion** — 一次链路完整闭环

如果中间 Step 1 → Step 3 之间别人改了某条 KP：
- Step 3 该条返 `version_conflict` + 新的 `current_version`
- 调用方决定：用新 version 重提（覆盖别人的改动）/ 跳过 / 重新 dryRun 看新 diff

## 4. 性能与限制

| 指标 | 限制 | 理由 |
|---|---|---|
| `updates.length` | ≤ 50 | CF Worker 50ms CPU 限制：100 条 × ~5 SQL statement = 500 statement，撞上限风险大 |
| 请求体总大小 | ≤ 1MB | CF Pages Functions 默认上限，超出 413 |
| 单条 patch 字段数 | ≤ 20 | KP 总字段数本来就少，超 20 = 异常使用 |
| 端到端响应时间预算 | < 10s | 50 条同步执行的合理上限 |

## 5. 关键实现要求

### 5.1 必须复用现有代码

- **schema base**：`KpCreateInput`（`src/schemas/kp-api.ts`）— 派生 `KpBatchPatchInput`，但 title/body/evalContent 改为各自 partial（允许子 key 缺省）
- **单条主写逻辑**：`patchKpRecord`（`src/lib/kp-api-store.ts:298`）— batch 在外层 loop 调用，但**先做 merge** 再传完整 patch
- **tenant 校验**：现有 `tenantForExistingKp` / `resolveTenantContext`
- **D1 测试 fixture**：`tests/shims/d1-test-db.ts` + `tests/shims/apply-migrations.ts`（v0.7.33 引入的真 SQLite 测试基础设施）

### 5.2 新增 schema：KpBatchPatchInput

```ts
// src/schemas/kp-batch-api.ts (new file)
import { z } from 'zod';
import { KpFormat } from './kp-api';
import { SchoolKey, ScholarKey } from './kp';

const TitlePartial = z.object({
  zh: z.string().optional(),
  ja: z.string().optional(),
  en: z.string().optional(),
}).strict().refine((v) => Object.keys(v).length > 0, 'title 至少传 1 个语种');

const BodyPartial = z.object({
  zh: z.string().optional(),
  ja: z.string().optional(),
}).strict().refine((v) => Object.keys(v).length > 0, 'body 至少传 1 个语种');

const EvalContentPartial = z.object({
  zh: z.record(z.string()).optional(),
  ja: z.record(z.string()).optional(),
}).strict();

export const KpBatchPatchInput = z.object({
  title: TitlePartial.optional(),
  body: BodyPartial.optional(),
  format: KpFormat.optional(),
  year: z.string().trim().optional(),
  schools: z.array(SchoolKey).min(1).optional(),
  scholars: z.array(ScholarKey).optional(),
  tags: z.array(z.string()).optional(),
  evalContent: EvalContentPartial.optional(),
}).strict().refine((v) => Object.keys(v).length > 0, 'patch 至少 1 个字段');
```

### 5.3 必须避免 N+1 校验

每条 patch 改 schools/scholars 都要校验 key 是否属于 tenant。**不要 50 条触发 50 次 DB 查询**。

正确做法：
1. 收集所有 patch 里出现的 schools / scholars key 集合
2. 一次 `SELECT key FROM school WHERE discipline = ?` + 一次 `SELECT key FROM scholar WHERE discipline = ?` 拿全集
3. 内存里查每条 patch 的 key 是否 ∈ 全集

### 5.4 乐观锁实现

复用 `knowledge_point_versions` 表的 `version` 字段（已存在，audit 用）。

伪代码：
```ts
for each update:
  current = SELECT version FROM kp_versions WHERE kp_id = ? ORDER BY version DESC LIMIT 1
  if non-dryRun && current != ifMatchVersion:
    push { id, ok: false, reason: 'version_conflict', current_version: current, expected_version: ifMatchVersion }
    continue
  merged_patch = mergeWithCurrent(current_kp, patch)  // shallow merge title/body/evalContent
  patchKpRecord(merged_patch, ...)  // 内部已写新 version 快照
```

### 5.5 shallow merge 实现

伪代码：
```ts
function mergeBatchPatch(current: Kp, patch: KpBatchPatchInput): Kp {
  return {
    ...current,
    ...patch,                                          // 标量 + 数组：整体替换
    title: patch.title ? { ...current.title, ...patch.title } : current.title,    // shallow merge
    body:  patch.body  ? { ...current.body,  ...patch.body  } : current.body,     // shallow merge
    evalContent: patch.evalContent
      ? { ...current.evalContent, ...patch.evalContent }                          // shallow merge zh/ja 维度
      : current.evalContent,
  };
}
```

注意：
- `evalContent.zh` 内部 Record 是**整体替换**（不再深 merge），跟 §3.2.1 规定一致
- 数组字段（schools/scholars/tags）由 `...patch` 覆盖，传 `[]` 真清空、不传保持

### 5.6 dryRun 实现

dryRun 模式必须**与真实写入路径走同一个 zod 校验 + 同一个 tenant key 校验 + 同一个 merge 逻辑**，否则会出现 dryRun 通过但真写失败的情况。

唯一不同：dryRun 不调 `patchKpRecord`，而是调 `mergeBatchPatch` 后 diff 与原 KP 比较。

diff 计算见 §3.4.2。

### 5.7 逐条独立，不强行事务

每条 patch 自己是一个 D1 batch（主表 + joins + fts，原本就是原子的）。

**不要**把 50 条包在一个大事务里：
- D1 batch 里 statement 越多越慢、越容易撞 CPU 上限
- 任何一条失败会回滚已成功的 49 条 — 用户重跑成本极高

逐条独立 = 失败的可单独 retry，成功的已落库。

## 6. 风险与缓解

| 风险 | 缓解 |
|---|---|
| CF Worker 50ms CPU 上限 | MVP 限 50 条；监控 P95 响应时间，必要时进一步降到 30 条 |
| N+1 关联校验拖慢 | §5.3 批量预查 |
| 多人并发覆盖 | §5.4 乐观锁 + `version_conflict` 409 |
| dryRun 与真写漂移 | §3.7 推荐 workflow + dryRun 必返 `current_version` |
| FTS 索引半新半旧 | 接受 — 逐条独立处理，失败行明确标记，前端引导 retry |
| 审计表膨胀 | 不解决，先记着；真撞上做归档 |
| evalContent.zh 整体替换可能误删子字段 | §3.2.1 明确规定语义，文档强调；后续可加 `evalContent.zh.义` 单字段语法（不在 MVP） |

## 7. 测试要求

复用 v0.7.33 引入的真 SQLite 测试基础设施（`tests/shims/d1-test-db.ts`）。

新增 `tests/kps-batch-api.test.ts` 必须覆盖：

- ✅ Happy path：5 条 patch 全成功，version 都 +1
- ✅ Mixed：5 条里 2 条 `kp_not_found` + 3 条成功，summary 数字正确
- ✅ Version conflict：1 条 `ifMatchVersion` 错 → 该条 `version_conflict` 其他成功
- ✅ Forbidden field：patch 含 `id` → 该条 `forbidden_field` + 返 `current_version`
- ✅ school_not_in_tenant：schools 含跨学科 key → 该条 reason + invalid_keys + `current_version`
- ✅ **shallow merge title**：原 KP `title:{zh:旧,ja:旧,en:旧}`，patch `title:{zh:新}`，写入后 ja/en 保留
- ✅ **shallow merge body**：同上
- ✅ **shallow merge evalContent**：原 zh/ja 都有，patch 只传 zh，结果 ja 保留；但 zh 内部 Record 整体替换
- ✅ 数组清空：`scholars: []` 写入后 KP 真无学者
- ✅ 数组保持：不传 `scholars` key，KP 学者不变
- ✅ dryRun：返 diff，**真查 DB 确认未写入**
- ✅ dryRun + 校验失败：patch 含 `forbidden_field`，仍返 `current_version`
- ✅ Limit：51 条返 `too_many_items`
- ✅ Empty `updates`：返 `updates_empty`
- ✅ 乐观锁链路：第一次成功后 version +1，第二次用旧 version 必返 conflict
- ✅ N+1 校验避免：mock DB 查询计数，50 条 patch 改 schools 总查询数 ≤ 5

## 8. 工程量

| 模块 | 工程量 |
|---|---|
| `PATCH /api/kps/batch` 路由 + body schema | 半天 |
| `KpBatchPatchInput` schema (新建) | 1 小时 |
| `mergeBatchPatch` helper + `patchKpsBatch` store | 1 天 |
| dryRun + diff 计算 helper | 半天 |
| 批量预查 helper（避免 N+1） | 半天 |
| Integration test（15+ case） | 1 天 |
| 文档更新（api-reference.md 加 §4.x batch 章节） | 1 小时 |

**总计 ~3.5 天**（v1 估的 3 天 + 0.5 天给 merge 实现 + 额外测试）。

## 9. 上线 checklist

- [ ] 全套测试通过（包括上述 15+ 新 case）
- [ ] 用真 prod-like 数据 dryRun 一次（marketing 50 条 KP），确认 diff 输出可读
- [ ] **专门 verify shallow merge**：找一条 KP 同时有 zh/ja/en 标题，dryRun 只改 zh，确认 diff 只有 `title.zh`，且 dryRun 后真实 PATCH 写入后 ja/en 真没动
- [ ] 用相同 50 条做真实 PATCH，确认全部成功 + version 都 +1
- [ ] 故意构造 1 条 conflict + 1 条 not_found，验证 summary 与 results 匹配
- [ ] 故意构造 1 条 patch 校验失败，验证 dryRun 仍返 `current_version`
- [ ] 在 `v2/public/docs/api-reference.md` §4 KP API 末尾加一个 `4.8 PATCH /api/kps/batch` 子章节，包含 §3.7 推荐 workflow
- [ ] CHANGELOG / commit message 标 v0.7.35

## 10. 后续扩展（不在本 MVP）

排队等待，**不要混进 MVP**：

1. 上限放 100 条（验过 P95 < 8s 后）
2. 数组 `addSchools/removeSchools/addTags/removeTags` 增量操作
3. 异步 job 模式（提交 → jobId → 轮询）
4. 跨 discipline 批量（当前限定单 discipline）
5. School / Scholar 的批量 PATCH（复用本 PRD 模式）
6. **把单条 `PATCH /api/kps/:id` 也升级为 shallow merge 语义**，统一全栈 — 当前为避免影响现有调用方暂不动
7. evalContent 子字段语法（如 `evalContent.zh.义` 单独 patch），避免 zh Record 整体替换的尴尬

---

**心智模型提醒**（写给实现者的最后一句）：

> 这个端点的**唯一真源**是 D1。不要写 git，不要调 sync 接口，不要触发 webhook。
> 批量编辑是 API-first 路径的自然延伸，不是 git-first 路径的批量化。
>
> **shallow merge 是关键语义**：调用方传什么 = 想改什么。不传的，都保持原样。
