# API contract v0.8.0 迁移指南 · KP body 结构化

> **状态**：草稿（PM 起草，Stage 3 ship 当天定稿）。
>
> **谁该读**：任何会调 `POST/PATCH /api/kps` 或 `PATCH /api/kps/batch` 的 agent / 集成方。**老师 agent 必读**。
>
> **什么时候 cut**：v0.8.0 起 hard cut。具体日期见 [§9 Schedule](#9-schedule)。**cut 之后旧 contract 直接返 422，不会兼容降级**。
>
> **黄金原则**：本指南 = "API 接受什么 + 怎么改"。**字段语义教学**（"义"该写什么、quad 4 格顺序）仍以 [kp-field-guide.md](kp-field-guide.md) 为准；本指南只讲**形状变化**。

---

## 目录

1. [一句话概括 + 影响范围](#1-一句话概括--影响范围)
2. [核心变化对照表](#2-核心变化对照表)
3. [5 format 写入示例（before vs after）](#3-5-format-写入示例before-vs-after)
4. [evalContent → evaluations 改名](#4-evalcontent--evaluations-改名)
5. [PATCH 语义变化（body 不再 shallow merge）](#5-patch-语义变化body-不再-shallow-merge)
6. [起手模板：`GET /api/kps/empty-body`](#6-起手模板-get-apikpsempty-body)
7. [错误码表](#7-错误码表)
8. [迁移检查清单](#8-迁移检查清单)
9. [Schedule](#9-schedule)
10. [FAQ](#10-faq)

---

## 1. 一句话概括 + 影响范围

**变化**：KP `body: string` (DSL) + 顶层 `format: enum` → KP `body.zh: KpBody`（discriminated union by `format`，format 字段在 body 内），同时 `evalContent` 改名 `evaluations` 且字段英化。

**为什么**：v0.7.35 m178 事件证明 string body + 顶层 format 两字段独立 → 编辑后 format/body 不一致 → 渲染崩 / 编辑器看不到 items。新 schema 让 zod 层就拒掉这种状态。完整动机见 [PRD §1](../../docs/KP-BODY-STRUCTURED-PRD.md#1-背景与动机)。

**影响范围**：

| 调用方 | 受影响 endpoint | 改动量 |
|---|---|---|
| **老师 agent**（写 KP / 改 KP / batch 改 KP） | `POST /api/kps` / `PATCH /api/kps/:id` / `PATCH /api/kps/batch` | **必改**（旧 payload 会返 422） |
| 学习 agent（写 study log） | `POST /api/study-sessions` 等 | **不受影响** |
| 读取方（`GET /api/kps`、`GET /api/kps/:id`） | — | **不受影响**（read 路径 v0.7.39 起已切新列；response 暂保留旧字段兼容，Stage 5 才 drop） |

> ⚠️ 即使你只调 batch API 改 `title` 这种"非 body 字段"，**只要 payload 里同时含 `format` 顶层字段**就会返 422。安全做法：拿到 KP 后只发要改的子字段，别原样回写整个 KP。

---

## 2. 核心变化对照表

| # | 字段 | v0.7.x（旧） | v0.8.x（新） |
|---|---|---|---|
| 1 | format 位置 | KP 顶层 `format: 'narrative' \| ...` | `body.zh.format` / `body.ja.format`（移到 body 内） |
| 2 | body 类型 | `body.zh: string`（DSL，含 `◆`、`【】` 等 marker） | `body.zh: KpBody`（结构化对象，按 format 不同字段集） |
| 3 | format/body 一致性 | 两字段独立，可能不一致（v0.7.35 bug 来源） | discriminated union — schema 层拒绝不一致 |
| 4 | evaluations 字段名 | `evalContent: { zh, ja }` | `evaluations: { zh, ja }` |
| 5 | evaluations key | 中文/日文汉字（`义/限/例/应/用/喻` / `義/限/例/応/用/喩`） | 英文（`meaning/limit/example/response/application/analogy`，zh/ja 共用同一组 key） |
| 6 | body 内 `◆评价——` 段 | 允许（解析时抽出） | **禁止**（zod 校验失败 → 422）；evaluations 必须独立字段 |
| 7 | quad cells 数量 | 隐式期望 4，但可写 != 4 | 严格 `length === 4`，否则 422 |
| 8 | flat-list / accordion / compare 最小约束 | 隐式 | flat-list `items >= 1`，accordion `groups >= 1`，compare `cols >= 2` |
| 9 | PATCH `body` 语义 | shallow merge（保留另一语种） | **整体替换**该语种（zh 是 discriminated union，不能跨 format 子字段 merge） |

---

## 3. 5 format 写入示例（before vs after）

> 以下例子用 `POST /api/kps?discipline=keiei` 创建。`PATCH /api/kps/:id` 同样形状（用 partial）。
>
> 字段语义（每个字段表达什么）见 [kp-field-guide.md](kp-field-guide.md) — **本节只展示形状**，不重复语义教学。

### 3.1 narrative（叙事）

**v0.7.x（旧）**：
```jsonc
{
  "id": "k_demo",
  "title": { "zh": "需求层次理论" },
  "format": "narrative",
  "body": {
    "zh": "Maslow 1943 年提出 5 层需求金字塔..."
  },
  "schools": ["motivation"],
  "scholars": ["maslow"],
  "year": "1943"
}
```

**v0.8.x（新）**：
```jsonc
{
  "id": "k_demo",
  "title": { "zh": "需求层次理论" },
  "body": {
    "zh": {
      "format": "narrative",
      "prose": "Maslow 1943 年提出 5 层需求金字塔..."
    }
  },
  "schools": ["motivation"],
  "scholars": ["maslow"],
  "year": "1943"
}
```

**diff 要点**：
- 顶层 `"format": "narrative"` 删掉
- `body.zh` 从 string 变成 `{ format: "narrative", prose: <旧 string 内容> }`

---

### 3.2 flat-list（条目列表）

**v0.7.x（旧）**：
```jsonc
{
  "id": "m178",
  "title": { "zh": "消费者非补偿性选择规则" },
  "format": "flat-list",
  "body": {
    "zh": "消费者比较品牌时不总是完全理性，会用以下选择规则：◆线性补偿型——各属性按重要度加权...◆连结型——所有属性必须达到最低门槛..."
  },
  "schools": ["consumer_behavior"]
}
```

**v0.8.x（新）**：
```jsonc
{
  "id": "m178",
  "title": { "zh": "消费者非补偿性选择规则" },
  "body": {
    "zh": {
      "format": "flat-list",
      "lead": "消费者比较品牌时不总是完全理性，会用以下选择规则：",
      "items": [
        { "name": "线性补偿型", "desc": "各属性按重要度加权，总分最高者被选择。" },
        { "name": "连结型", "desc": "所有属性必须达到最低门槛，否则被排除。" }
      ]
    }
  },
  "schools": ["consumer_behavior"]
}
```

**diff 要点**：
- 旧 DSL 里 `◆名称——描述` 段 → `items[].name` / `items[].desc`
- 旧 lead 句（◆ 之前的部分） → `lead`
- `items` 至少 1 条，否则 422 (`schema_invalid`)

---

### 3.3 accordion（折叠分组）

**v0.7.x（旧）**：
```jsonc
{
  "format": "accordion",
  "body": {
    "zh": "组织变革按 Lewin 模型分三阶段：【解冻阶段】◆识别现状——分析当前压力源...◆制造紧迫感——沟通变革必要性...【改变阶段】◆推行新方法——..."
  }
}
```

**v0.8.x（新）**：
```jsonc
{
  "body": {
    "zh": {
      "format": "accordion",
      "lead": "组织变革按 Lewin 模型分三阶段：",
      "groups": [
        {
          "title": "解冻阶段",
          "items": [
            { "name": "识别现状", "desc": "分析当前压力源..." },
            { "name": "制造紧迫感", "desc": "沟通变革必要性..." }
          ]
        },
        {
          "title": "改变阶段",
          "items": [
            { "name": "推行新方法", "desc": "..." }
          ]
        }
      ]
    }
  }
}
```

**diff 要点**：
- 旧 `【组名】` → `groups[].title`
- 组下 `◆名——描述` → `groups[].items[].{name,desc}`
- `groups` 至少 1 个；空 group 允许（`items: []`）但通常 2-5 条/组比较自然

---

### 3.4 compare（对比表）

**v0.7.x（旧）**：
```jsonc
{
  "format": "compare",
  "body": {
    "zh": "经典管理学三大学派对比：◆古典学派|关键词:效率|定义:把组织视为机器...|类型:管理理论|相关:科学管理/官僚制|详情:...◆行为学派|关键词:人际关系|..."
  }
}
```

**v0.8.x（新）**：
```jsonc
{
  "body": {
    "zh": {
      "format": "compare",
      "lead": "经典管理学三大学派对比：",
      "cols": [
        {
          "title": "古典学派",
          "keyword": "效率",
          "desc": "把组织视为机器...",
          "type": "管理理论",
          "theories": "科学管理 / 官僚制",
          "detail": "..."
        },
        {
          "title": "行为学派",
          "keyword": "人际关系",
          "desc": "...",
          "type": "",
          "theories": "",
          "detail": ""
        }
      ]
    }
  }
}
```

**diff 要点**：
- 6 个列字段：`title`（必填）/ `keyword` / `desc` / `type` / `theories` / `detail`（其余可空字符串）
- `cols` 至少 2 列，否则 422
- 字段对应关系不再靠 `|关键词:` 这种 marker 解析 — 直接 JSON key

---

### 3.5 quad（四象限）

**v0.7.x（旧）**：
```jsonc
{
  "format": "quad",
  "body": {
    "zh": "BCG 矩阵 — 市场增长率 × 相对市场份额：◆问题|高增长+低份额|❓|需要决策投资还是放弃◆明星|高增长+高份额|⭐|继续投入..."
  }
}
```

**v0.8.x（新）**：
```jsonc
{
  "body": {
    "zh": {
      "format": "quad",
      "lead": "BCG 矩阵：",
      "yAxis": "市场增长率",
      "xAxis": "相对市场份额",
      "cells": [
        { "name": "问题", "emoji": "❓", "sub": "高增长 + 低份额", "detail": "需要决策投资还是放弃。" },
        { "name": "明星", "emoji": "⭐", "sub": "高增长 + 高份额", "detail": "继续投入维持竞争优势。" },
        { "name": "瘦狗", "emoji": "🐕", "sub": "低增长 + 低份额", "detail": "考虑剥离。" },
        { "name": "现金牛", "emoji": "💰", "sub": "低增长 + 高份额", "detail": "保维护性投入。" }
      ]
    }
  }
}
```

**diff 要点**：
- **`cells.length` 必须严格 == 4**，不是 3 / 不是 5 — 否则 422
- 顺序固定：`[左上(高y, 低x), 右上(高y, 高x), 左下(低y, 低x), 右下(低y, 高x)]`，详见 [kp-field-guide.md §2.5](kp-field-guide.md#25-quad-的-axes-和-cells)
- `yAxis` / `xAxis` 是**维度名**（如 "市场增长率"），不是 "高 / 低" 本身

---

## 4. evalContent → evaluations 改名

### 4.1 字段名变化

```diff
- "evalContent": {
-   "zh": { "义": "...", "限": "...", "例": "...", "应": "...", "用": "...", "喻": "..." },
-   "ja": { "義": "...", "限": "...", "例": "...", "応": "...", "用": "...", "喩": "..." }
- }
+ "evaluations": {
+   "zh": {
+     "meaning": "...", "limit": "...", "example": "...",
+     "response": "...", "application": "...", "analogy": "..."
+   },
+   "ja": {
+     "meaning": "...", "limit": "...", "example": "...",
+     "response": "...", "application": "...", "analogy": "..."
+   }
+ }
```

**两个变化同时发生（不分阶段）**：
- 顶层 key：`evalContent` → `evaluations`
- 子 key：中/日文汉字 → 英文 6 字段，**zh 和 ja 共用同一套英文 key**

### 4.2 字段对应表

| 旧 zh key | 旧 ja key | 新 key（zh / ja 共用） | 含义 |
|---|---|---|---|
| 义 | 義 | `meaning` | 学术 / 实务贡献 |
| 限 | 限 | `limit` | 理论的不足 / 边界 |
| 例 | 例 | `example` | 真实企业案例 |
| 应 | 応 | `response` | 应对策略 / 处方 |
| 用 | 用 | `application` | 实务应用场景 |
| 喻 | 喩 | `analogy` | 比喻 / 记忆 |

字段语义教学不变（仍按 [kp-field-guide.md §3](kp-field-guide.md#3-evaluations-6-字段语义)）— 改的只是 key 字符。

### 4.3 body 内的 `◆评价——` 段移除

旧 contract 允许把评价写在 body 字符串里（如 `◆意义——XX`）— **新 contract 禁止**。所有 evaluations 必须写到独立 `evaluations.zh.<key>` 字段。

如果 body 里残留旧 `◆评价——` marker → zod 拒（取决于哪种 format，可能误当成 item.name 校验失败 → 422）。

> ℹ️ **存量数据迁移**：v0.7.41 已 backfill prod，692 KP 全部干净。Stage 3 启动时跑 audit 一次最终确认 — 见 [PRD §11 上线 checklist](../../docs/KP-BODY-STRUCTURED-PRD.md#11-上线-checklist)。

---

## 5. PATCH 语义变化（body 不再 shallow merge）

### 5.1 旧 batch API 行为

`PATCH /api/kps/batch`（v0.7.35）的 shallow merge：传 `body.zh` 替换 zh，**ja 保留**。

### 5.2 新 contract 下的语义

**`title` 仍 shallow merge**（zh/ja/en 各自独立 string，merge 安全）。

**`body` 仍按语种 shallow merge**（传 `body.zh` 替换 zh，ja 保留），**但单语种内部不再 merge**（zh 是 discriminated union，跨 format 部分字段类型不安全 — 必须整体替换 zh 的整个 KpBody）。

**`evaluations` 按语种 shallow merge**（传 `evaluations.zh` 替换整个 zh Record；不深 merge 到 zh.meaning 这一级）。

**例**：

```jsonc
// 现有 KP
{
  "body": {
    "zh": { "format": "flat-list", "lead": "L1", "items": [{ "name": "A", "desc": "a" }] },
    "ja": { "format": "flat-list", "lead": "L1ja", "items": [{ "name": "Aja", "desc": "aja" }] }
  }
}

// PATCH（只想把 zh 加一条 item）
// ❌ 不能这么写（没有 deep merge）：
{ "body": { "zh": { "items": [{ "name": "B", "desc": "b" }] } } }
// → 422 schema_invalid（zh 不是合法 KpBody — 缺 format / 缺 lead）

// ✅ 必须整体重写 zh：
{
  "body": {
    "zh": {
      "format": "flat-list",
      "lead": "L1",
      "items": [
        { "name": "A", "desc": "a" },
        { "name": "B", "desc": "b" }
      ]
    }
  }
}
// → ja 保留，zh 整体替换
```

### 5.3 推荐 workflow（替代旧的 partial 写法）

```
Step 1.  GET /api/kps/:id 拿当前 KP（含 body.zh 完整结构 + version）
Step 2.  本地构建新 body.zh（修改你想改的字段后整体）
Step 3.  PATCH /api/kps/:id 带 ifMatchVersion + body.zh 整体
```

batch 同理 — 每条 update 的 `patch.body.zh` 必须是完整 KpBody。

> 💡 未来可能会加 `BatchKpItemPatchInput`（支持改某条 item 而不重发 items 整体），但**不在 v0.8.0 scope**。

---

## 6. 起手模板：`GET /api/kps/empty-body`

新增 endpoint（v0.8.0 起可用）：拿指定 format 的空白 KpBody 模板，给"新建 KP / 切 format"起手用。

```bash
curl -H "Authorization: Bearer $MS_TOKEN" \
  'https://study.sususu.org/api/kps/empty-body?format=flat-list'
```

```json
{
  "ok": true,
  "body": {
    "format": "flat-list",
    "lead": "",
    "items": [{ "name": "", "desc": "" }]
  }
}
```

支持 `format` ∈ `narrative | flat-list | accordion | compare | quad`。

**用途**：
- 新建 KP 时 GET 一份空白 → 填字段 → POST
- 切 format 时 GET 新 format 空白 → 替换原 body.zh（旧数据丢弃）

---

## 7. 错误码表

> **PM 决策**：server 在 zod parse **之前**先识别"输入是不是老 contract" — 若是，返带 `migration_guide` URL 的明确错误码，让调用方知道怎么改。
>
> 这意味着发老 payload 不会得到一个泛的 `schema_invalid`，而是收到具体的"哪里旧了 + 看哪里"。

### 7.1 v0.8.0 新增 / 改动的错误码

| HTTP | reason | 触发条件 | 提示文 / 修法 |
|---|---|---|---|
| 422 | `legacy_top_level_format` | payload 含顶层 `format` 字段 | "v0.8.0 起 format 移到 body.{zh,ja}.format。见 /docs/migration-v0.8.md §3" |
| 422 | `legacy_string_body` | `body.zh` 或 `body.ja` 是 string 而非 object | "v0.8.0 起 body 是结构化对象。见 /docs/migration-v0.8.md §3" |
| 422 | `legacy_evalcontent_field` | payload 含 `evalContent` key | "已改名 evaluations 且子 key 英化。见 /docs/migration-v0.8.md §4" |
| 422 | `legacy_eval_in_body` | body 内含 `◆评价——` 段 | "评价必须写到独立 evaluations 字段，body 内禁止 ◆评价——。见 /docs/migration-v0.8.md §4.3" |
| 422 | `body_format_invalid` | `body.zh.format` 不在 5 种合法值（已经新形状但 format 写错） | "format 必须是 narrative \| flat-list \| accordion \| compare \| quad" |
| 422 | `body_structure_invalid` | body 形状对得上 format，但内部字段不合法（如 quad cells != 4，flat-list items 空） | 含 zod issue path / message，定位具体字段 |

**所有 4xx 响应统一带**：
```jsonc
{
  "ok": false,
  "reason": "legacy_string_body",
  "message": "...",
  "migration_guide": "https://study.sususu.org/docs/migration-v0.8.md"
}
```

### 7.2 已废弃的 v0.7.x 错误码

`body_format_mismatch`（v0.7.36 短期 guard 用的）— v0.8.0 已不再产生，因为新 schema 不可能"format/body 不一致"。

### 7.3 batch API 单条 reason

batch API 每条 `results[]` 的 `reason` 字段也会出现上述 `legacy_*` 值（单条级别拒，不影响其它条）。整体仍返 200 + summary。

---

## 8. 迁移检查清单

### 8.1 调用方代码改动

- [ ] 删掉所有发出去的顶层 `format` 字段
- [ ] 把 `body.zh` / `body.ja` 从 string 改成 `KpBody` 对象（见 §3 各 format 形状）
- [ ] `evalContent` rename → `evaluations`，6 子 key 英化
- [ ] body string 里的 `◆评价——` 段抽到 `evaluations.zh.<英文key>`
- [ ] PATCH 流程：GET 当前 → 本地改 → 整体替换 zh（如果改 body）
- [ ] 错误处理：识别 `legacy_*` reason，记录到日志方便排查

### 8.2 测试自检

调用方在 staging 跑一遍 happy path（每 format 至少 1 个 POST + 1 个 PATCH），确认：

- [ ] 5 format 都能创建成功（200 + 返 KP）
- [ ] 故意发旧 payload 收到对应 `legacy_*` 422（不是 `schema_invalid`）
- [ ] PATCH 整体替换 body.zh 后，body.ja 保留
- [ ] evaluations 6 字段全填能正确读回

### 8.3 切换日通知

- 切换前 1 周收到 PM 邮件 / IM 通知，含 staging 测试会日期
- 切换日有 1 小时窗口（10:00-11:00 JST）— 有问题立刻 IM
- cut 后 24 小时内监控日志 `[KP_API_LEGACY_REJECT]` — 若发现仍有调用方发旧 payload，PM 主动联系

---

## 9. Schedule

| 日期 | 事件 |
|---|---|
| **2026-05-08（周五）** | PM 发本指南给老师 agent + 用法演示 |
| **2026-05-12（周二）10:00–11:00 JST** | Staging 测试会：老师 agent 用新 contract 跑一遍真实工作流 |
| **2026-05-13（周三）** | 修测试会发现的问题（若有） |
| **2026-05-15（周五）10:00 JST** | **v0.8.0 ship** — API hard cut 生效 |
| 2026-05-15 ~ 05-22 | PM 监控 `[KP_API_LEGACY_REJECT]` 日志 + IM 待命 |

> ⚠️ **最早 ship 日 = 5/15**。如果 staging 测试发现问题，可推迟，但**不会提前**。

---

## 10. FAQ

### Q1. 我能不能继续用旧 contract 写一段时间？

不能。Hard cut 决策见 [PRD §6.2](../../docs/KP-BODY-STRUCTURED-PRD.md#62-hard-cut-vs-soft-compat) — 双轨期 = bug 温床。Cut 后旧 payload 一律 422。

### Q2. 我已经写好的旧字段格式 KP 怎么办？

**不用你管**。v0.7.41 backfill 已经把 prod 692 KP 全部双写到新列。你只要保证**新写入用新 contract** 即可。

### Q3. 如果我只想改 KP 的 title，需要改我的代码吗？

**视情况**：
- 如果你的 PATCH payload 只发 `{ "title": { "zh": "..." } }` — **不需要改**（不涉及 format/body/evalContent）
- 如果你 PATCH 时把 GET 来的整个 KP 原样回写（含顶层 `format`、string body、`evalContent`） — **需要改**（payload 含旧字段会 422）

推荐：**永远只发要改的子字段**，不要 GET → 改 → 整体回写。

### Q4. 中日双语 format 必须一致吗？

**schema 上不强制**（zh.format 可以 narrative，ja.format 可以 flat-list，分开写）。
**产品上强制一致**（编辑器 UI 不暴露分别选择 — 切 format 同时改 zh + ja）。

老师 agent 写 batch payload 时建议保持 zh.format == ja.format，避免编辑器后续打开时 UX 困惑。

### Q5. 找不到原 ◆ 评价段对应的英文 key 怎么办？

查 [§4.2 字段对应表](#42-字段对应表)。如果原 KP 评价段语义跟 6 个字段都对不上 — 留空（不写就不渲染），或写到最贴近的那个 key。

### Q6. 切换日如果我的代码还没改完？

调用 staging 验证日（5/12）那一周如果没改完，IM 通知 PM — 可以申请把 cut 推迟，但不影响其他工程节奏。**不要硬扛着 5/15 ship 一个不完整的迁移**。

### Q7. 怎么验证我的 payload 是新 contract？

发 staging（`management-study-v2.pages.dev`，对应 D1 用 staging KV）— 不会污染 prod。staging 在 5/8 ~ 5/14 期间打开 v0.8.0 preview 模式（cut 生效），任何老 payload 都会返 `legacy_*`。

---

> **疑问 / 改动建议**：本指南由 PM 维护，发现错误或想加 FAQ 项 → 直接在仓库提 issue（标 `migration-v0.8`）或 IM PM。
