# `[KP_RENDER_FALLBACK]` 监控操作手册

> **谁该读**：v0.8.0 Stage 2-4 期间值班 / oncall。
>
> **为什么存在**：渲染层从 v0.7.39 起优先读新列 `body_zh_json`，新列 NULL / parse 失败时降级到旧列并打 `[KP_RENDER_FALLBACK]` warn。**该日志出现 = 双写有 bug**（不是正常的 fallback 容错）。这份 cheatsheet 给值班一个 30 秒上手的 triage 流程。
>
> **baseline 期望**：**0 条**。Stage 1 backfill 已跑（692/692），4 写入路径（sync / api / batch / backfill）都双写，正常状态下 fallback 分支永远走不到。
>
> **存活期**：本文档仅 v0.8.0 Stage 2 ~ Stage 5 之间有效。Stage 5 物理 drop 旧列后，fallback 分支自然失效（没旧列可读），可删本文。

---

## 1. 哪里看日志

### 选项 A — 命令行 `wrangler` tail（推荐）

```bash
# 在仓库根目录
cd v2
npx wrangler pages deployment tail --project-name=management-study-v2 \
  | grep -E '\[KP_RENDER_FALLBACK\]'
```

- 实时流式输出，stdout 直接看到 fallback 事件
- `grep` 过滤后只剩告警行
- Ctrl+C 退出

加 `--format=json` 可以拿结构化 JSON（更易二次处理）。

### 选项 B — CF Dashboard

1. 浏览器进 [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. 左栏 **Workers & Pages** → 找 `management-study-v2`
3. 上方 tab 切到 **Functions** → **Real-time Logs**（Tail 是这里）
4. 点 **Begin log stream**
5. 右上角 search 框输入 `KP_RENDER_FALLBACK` 过滤

> ⚠️ Dashboard 的 tail 一次最多 5 分钟会断流，长时间监控用选项 A。

### 选项 C — 离线复盘

历史日志（>5 分钟前）需要 Logpush 之类持久存储 — **当前未配置**。Stage 3 cut 当周如果担心错过日志，开 wrangler tail 录到本地文件：

```bash
npx wrangler pages deployment tail --project-name=management-study-v2 \
  | grep -E '\[KP_RENDER_FALLBACK\]' \
  | tee /tmp/kp-fallback-$(date +%Y%m%d).log
```

---

## 2. 日志结构

```
[KP_RENDER_FALLBACK] { kp_id: 'm178', reason: 'new_column_parse_failed', error: '...' }
[KP_RENDER_FALLBACK] { kp_id: 'k042', reason: 'new_column_null' }
```

| 字段 | 含义 |
|---|---|
| `kp_id` | 哪条 KP 触发了 fallback（未必每条都有 — 看渲染入口是否传） |
| `reason` | `new_column_null` / `new_column_parse_failed` 二选一 |
| `error` | 仅 `new_column_parse_failed` 有 — zod parse 错误 message |

代码位置：[v2/src/lib/render-body-with-fallback.ts:42-56](../src/lib/render-body-with-fallback.ts#L42)

---

## 3. 看到了怎么办（reason 分支）

### 3.1 `reason: new_column_null`

**含义**：渲染读到 `body_zh_json` 列是 NULL。

**可能原因**（从概率高到低）：
1. 该 KP 在 Stage 1 backfill 之后被新写入路径漏掉（4 路径之一忘了写新列）
2. 该 KP 是 backfill 跑完之后才创建的，但写入函数 bug 没有同时写新列
3. backfill 漏了某条（692/692 已 verify，但理论可能）

**triage（5 分钟内）**：

```bash
# 1. 看这条 KP 的两列状态
echo "SELECT id, body_zh, body_zh_json FROM kp WHERE id = 'XXX'" \
  | wrangler d1 execute management-study-v2 --remote
```

**结果分支**：

| 现象 | 判定 | 处置 |
|---|---|---|
| `body_zh_json` 是 NULL，`body_zh` 有内容 | 双写漏写新列 | （a）记下 KP id 和 updatedAt（b）查最近写它的路径 — sync / API / batch / backfill 哪个；（c）对照 §4 检查表（d）跑 admin 的 backfill endpoint 把这条补上 |
| `body_zh_json` 和 `body_zh` 都 NULL | 这条 KP 没 body | 看是否合法状态（KP 模板？测试数据？）— 通常 narrative + prose:'' 是合法 |

**临时止血**：触发一次 backfill 把单条补回 — 防止用户继续看到 fallback 渲染结果。

```bash
# admin endpoint，回填指定 id（仅 super-admin 调）
curl -X POST 'https://study.sususu.org/api/admin/backfill-kp-body-structured?ids=XXX' \
  -H "Authorization: Bearer $MS_AUTOMATION_TOKEN"
```

### 3.2 `reason: new_column_parse_failed`

**含义**：新列 `body_zh_json` 有内容，但 `KpBody.parse()` 失败。

**这是更严重的告警** — 说明双写函数把**非法 JSON / 非法形状**写进了新列。**先停手别 backfill**（会覆盖更多脏数据），先看 `error` 字段定位 zod 报错。

**triage（5 分钟内）**：

```bash
# 1. 拿出新列具体内容看
echo "SELECT id, body_zh_json FROM kp WHERE id = 'XXX'" \
  | wrangler d1 execute management-study-v2 --remote --json \
  | jq -r '.[0].results[0].body_zh_json' \
  | jq .
```

**常见错误模式**：

| zod error message 关键词 | 可能 bug |
|---|---|
| `Invalid discriminator value` | 写入时 format 字段没设 / 设成不在 5 种枚举值 |
| `items.*.name` empty | 写入路径没校验 item 必填 |
| `cells must have exactly 4` | quad KP 双写时少写 / 多写 cells |
| `Unrecognized key` | 多塞了字段（strict schema 拒绝） |

**找出哪个写入路径错了**：

```bash
# 看最近 24 小时有哪些写入路径触发
git log --since='24 hours ago' --oneline -- v2/src/lib/d1-kp-write.ts \
  v2/src/lib/kp-api-store.ts v2/src/lib/kp-batch-store.ts \
  v2/src/pages/api/admin/backfill-kp-body-structured.ts
```

**处置**：
1. 确认问题根因（哪个写入路径）
2. 修代码 + 加 test case → ship hotfix
3. 用 admin backfill 重写该条新列（覆盖脏数据）
4. 跑全量 audit 确认没有其他污染

---

## 4. 4 写入路径双写检查表

如果发现 fallback 频繁出现，按这张表逐项确认双写没漏：

| 路径 | 文件 | 触发场景 | 是否双写新列 |
|---|---|---|---|
| sync (git) | [v2/src/lib/d1-kp-write.ts](../src/lib/d1-kp-write.ts) | git push → webhook 同步 D1 | ✅ v0.7.38 起 |
| API POST/PATCH | [v2/src/lib/kp-api-store.ts](../src/lib/kp-api-store.ts) | `POST /api/kps` / `PATCH /api/kps/:id` | ✅ v0.7.38 起 |
| Batch PATCH | [v2/src/lib/kp-batch-store.ts](../src/lib/kp-batch-store.ts) | `PATCH /api/kps/batch` | ✅ v0.7.38 起 |
| Backfill admin | [v2/src/pages/api/admin/backfill-kp-body-structured.ts](../src/pages/api/admin/backfill-kp-body-structured.ts) | 手动调 admin endpoint | ✅ v0.7.38 起（idempotent） |

`v2/src/lib/d1-tables.ts` 的 `KP_TABLE.cols` 含 5 个新列 — `buildUpsertStmt` 自动跟列定义生成 SQL，理论上**任何走 buildUpsertStmt 的写入都会双写**。如果 fallback 频繁 → 说明某条路径绕过了 buildUpsertStmt。

---

## 5. 监控值班节奏

| 阶段 | 频率 |
|---|---|
| Stage 2 ship 后 48 小时 | 每 4 小时手动 tail 一次（5 分钟扫一遍） |
| Stage 2 稳定后 ~ Stage 3 cut 前 | 每天扫一次 |
| Stage 3 cut 当天 + 后 24 小时 | 持续 tail（开 §1 选项 A 录到本地） |
| Stage 4 期间 | 每天扫一次 |
| Stage 5 ship 前一周 | 确认连续 7 天 0 fallback 才能进 Stage 5 |

**任何一条 fallback 出现都要立即 triage** — 不要"等积累几条再处理"。一条 fallback = 用户看到了降级渲染，**用户体验已受影响**。

---

## 6. 配套工具

- 全量 audit（拿 dirty KP 清单）：[v2/src/lib/kp-audit-structured.ts](../src/lib/kp-audit-structured.ts)
- 双写漂移检测：[v2/src/lib/kp-drift-check.ts](../src/lib/kp-drift-check.ts)
- 补单条新列（idempotent）：`POST /api/admin/backfill-kp-body-structured?ids=k001,k002`

---

## 7. 升级到 sentry / Logpush（v0.8 后规划）

当前用 `console.warn` + 人工 tail 是 MVP 方案，依赖值班主动看。Stage 5 之后如果继续保留类似 fallback 模式（如未来其他重构），考虑：

- 接入 Logpush 把 `[KP_RENDER_FALLBACK]` push 到 R2 / S3 长期保存
- 接入真 Sentry / 自建 Slack webhook，触发就 page

**当前阶段不做** — Stage 5 后 fallback 路径消失，没必要建工具栈。

---

> 文档维护人：PM。bug / 改进建议 → IM 或 issue 标 `monitoring`。
