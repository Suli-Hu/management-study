# API Reference

> **谁该读**：在任意 worktree / 任意 Claude Code session 想以编程方式管理知识库或学习日志的 agent，以及外部集成方。
>
> **公开镜像 URL**（可对外分享）：
> https://study.sususu.org/docs/api-reference.md
>
> 本文件就是该镜像 URL 实际 serve 的真源 — 没有"另一份源 + cp 同步"的二元结构，编辑这一个文件即可。

---

## 目录

1. [快速开始](#1-快速开始)
2. [认证](#2-认证)
3. [资源模型 & 字段](#3-资源模型--字段)
4. [KP API](#4-kp-api)
5. [School API](#5-school-api)
6. [Scholar API](#6-scholar-api)
7. [View API](#7-view-api)
8. [Study Log API · 学习日志](#8-study-log-api--学习日志)
9. [元数据 / 搜索 / 状态](#9-元数据--搜索--状态)
10. [错误码总表](#10-错误码总表)
11. [Agent 调用配方](#11-agent-调用配方)
12. [Deprecated · git-sync 兜底](#12-deprecated--git-sync-兜底)
13. [真值参照](#13-真值参照)

---

## 1. 快速开始

### 1.1 Base URL

```
Production:  https://study.sususu.org
Fallback:    https://management-study-v2.pages.dev   ← CF Pages 默认域，同一部署
```

### 1.2 9 成场景 — API-first 写入

```bash
# 1. 拿 token：浏览器进 /admin/tokens 创建（一次性显示明文 ms_v1_xxx...）
# 2. 自检身份
curl -H "Authorization: Bearer $MS_TOKEN" https://study.sususu.org/api/me

# 3. 拿元数据（schools/scholars/themes/tags/views/formats 字典）
curl -H "Authorization: Bearer $MS_TOKEN" \
  'https://study.sususu.org/api/metadata?discipline=keiei'

# 4. 创建 KP（直接写 D1，不走 git）
curl -X POST 'https://study.sususu.org/api/kps?discipline=keiei' \
  -H "Authorization: Bearer $MS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "id":"k999", "title":{"zh":"..."}, "body":{"zh":"..."}, "format":"narrative",
        "year":"1943", "schools":["motivation"], "scholars":["maslow"], "tags":[] }'
```

### 1.3 写学习日志

```bash
curl -X POST https://study.sususu.org/api/study-sessions \
  -H "Authorization: Bearer $MS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "discipline":"keiei", "kp_id":"k001", "date":"2026-05-02",
        "start_time":"09:00", "duration_min":30, "rating":4 }'
```

完整流程见 [§8 Study Log API](#8-study-log-api--学习日志)。

### 1.4 旧 git-sync 工作流仍可用

写文件 → push → webhook 自动 sync D1 的旧路径仍然 work，但已 deprecated（[§12](#12-deprecated--git-sync-兜底)）。新代码请走 API-first。

---

## 2. 认证

### 2.1 两种认证方式

| 方式 | header | 适合 | 备注 |
|---|---|---|---|
| **Bearer token**（推荐） | `Authorization: Bearer ms_v1_<32hex>` | agent / 外部集成 | 自动豁免 CSRF Origin check，无需 cookie |
| **Admin cookie session** | `Cookie: ms_session=...; ms_user=...` | 浏览器登录后人工调试 | 写操作需要带正确 Origin header |

### 2.2 拿 Bearer token

1. 浏览器进 [`/admin/tokens`](https://study.sususu.org/admin/tokens)（必须先登录）
2. 点「新建 Token」→ 填名字（如 `learning-agent`）+ 选 scope（推荐按学科收窄，如 `["keiei"]`）
3. 提交后页面**一次性**显示明文 `ms_v1_xxxxxxxx...`（38 字符），保存好
4. 把 token 字符串告诉 agent / 写进 secret store

**Token 安全**：D1 只存 SHA-256 hash。明文丢失只能撤销重建。Token 不写日志、不出现在 URL。

### 2.3 Token scope 收窄

- 不带 scope 的 token = 该 user 的全部 discipline 权限
- 带 scope 的 token（如 `["keiei"]`）= 即使 user 是 super-admin，也只能访问 `keiei` 一个学科
- 访问 scope 外的 discipline → `403`

### 2.4 `GET /api/me` — 身份自检

token 自检端点，只读取服务端 auth context，不接受客户端传入身份。

```bash
curl 'https://study.sususu.org/api/me' \
  -H 'Authorization: Bearer ms_v1_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'
```

Response:

```json
{
  "ok": true,
  "user": { "id": "u_xxx", "email": "teacher@example.com", "display_name": null },
  "auth": {
    "is_super_admin": false,
    "is_invite_guest": false,
    "token_scopes": ["keiei"]
  },
  "disciplines": [
    {
      "key": "keiei",
      "tenant_id": "keiei",
      "title": { "zh": "经营学", "en": "Management" },
      "role": "editor",
      "can_read": true,
      "can_edit": true
    }
  ]
}
```

### 2.5 Tenant / discipline 选择

- 写操作必须显式指定 discipline：query param `?discipline=keiei` 或 header `x-discipline-key: keiei`
- 服务端用当前 session / token 校验该用户是否属于这个 tenant
- 写入时强制注入 `tenant_id` / `created_by` / `updated_by` — 请求 body 里的 `tenant_id` / `discipline` **不会被接受为业务数据源**

角色映射：

| role | 权限 |
|---|---|
| `owner` | 全部 |
| `editor` | KP / School / Scholar / View CRUD |
| `viewer` | 只读 |

兼容旧权限模型：`user_permission.admin` → 可写，`user_permission.guest` → 只读。

---

## 3. 资源模型 & 字段

四种业务资源都存在 D1，并镜像到 `v2/data/<discipline>/<dir>/<id>.json`（git）。

| 资源 | git 目录 | id 字段 | id 格式 | discipline 字段 |
|---|---|---|---|---|
| KP 知识点 | `kp/` | `id` | `^[a-z]{1,3}\d+$`（如 `k628`） | `discipline` |
| School 学派 | `schools/` | `key` | `^[a-z][a-z0-9_]*$`（如 `change`） | `discipline` |
| Scholar 学者 | `scholars/` | `key` | `^[a-z][a-z0-9_]*$`（如 `beckhard`） | `discipline` |
| View 视图 | `views/` | `id` | `^[a-z][a-z0-9_-]*$`（如 `motivation`） | `discipline` |

外加一类 per-user 私有数据：

| 资源 | D1 表 | 主键 | 说明 |
|---|---|---|---|
| Study Session 学习日志 | `study_session` | `id` (uuid) | 仅 owner 可读写，无 git mirror |

完整字段定义见 [v2/src/schemas/](https://github.com/Suli-Hu/Web-Project/tree/main/v2/src/schemas) — `kp.ts` / `school.ts` / `scholar.ts` / `view.ts` / `study-session.ts`。

### 3.1 KP 字段

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `id` | ✓ | string | 全 discipline 内唯一 |
| `discipline` | — | enum | 由服务端写入；body 里给了会被忽略 |
| `schools` | ✓ | string[] | ≥1 个，必须 ∈ 同 tenant 的 schools.key |
| `scholars` | — | string[] | 默认 []，必须 ∈ 同 tenant 的 scholars.key |
| `year` | ✓ | string | 默认 ""，如 `"1959"`、`"1980s"` |
| `title.zh` | ✓ | string | 中文标题 |
| `title.en` / `title.ja` | — | string | 可选 |
| `body.zh` | ✓ | string | 中文正文，结构跟 format 匹配 |
| `body.ja` | — | string | 日文正文 |
| `tags` | — | string[] | 颜色标签数组，引用 discipline.tags[].key |
| `format` | ✓ | enum | `narrative` / `flat-list` / `accordion` / `compare` / `quad` |
| `evalContent.zh` | — | object | `{义,限,例,应,用,喻}` |
| `evalContent.ja` | — | object | `{義,限,例,応,用,喩}` |
| `createdAt` / `updatedAt` | — | ISO 8601 | 服务端强制刷为 now，可不填 |

**body 5 种 format 的字符串结构**：见 [v2/public/docs/learning-kp-guide.md](learning-kp-guide.md)。

### 3.2 School 字段

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `key` | ✓ | string | 学派 key |
| `title.zh` | ✓ | string | 学派中文名 |
| `title.en` / `title.ja` | — | string | |
| `era` | — | string | 默认 ""，如 `"1947– 变革管理理论传统"` |
| `summary.zh` | ✓ | string | 学派概述 |
| `summary.ja` | — | string | |
| `themeKey` | ✓ | string | 必须 ∈ `discipline.themes[].key` |
| `tags` | — | string[] | 颜色标签 |
| `concepts` | — | string[] | 该学派下 KP id 列表，决定渲染顺序（默认 []） |

### 3.3 Scholar 字段

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `key` | ✓ | string | 学者 key |
| `name.zh` | ✓ | string | 中文名 |
| `name.en` / `name.ja` | — | string | |
| `schools` | — | string[] | 主属学派（默认 []） |
| `schoolsExplicit` | — | boolean | 默认 false。**API 写入时设 true** = schools[] 是真源，sync 跳过 KP 反向派生 |
| `contribution.zh` | ✓ | string | |
| `contribution.ja` | — | string | |
| `lifespan` | — | string | "1908–1970" |
| `institution` / `born` / `died` / `nationality` / `flag` / `origin` / `field` | — | string | v1 兼容字段 |
| `tags` | — | string[] | |
| `nobel` | — | object \| null | `{year, detail}` |
| `kpsOrder` | — | string[] | 该学者下 KP 渲染顺序 |

### 3.4 View 字段

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `id` | ✓ | string | 视图 id |
| `name` | ✓ | string | 视图名（中文） |
| `jp` | — | string | |
| `icon` | ✓ | string | emoji（如 `📚`） |
| `description` / `flow` | — | string | |
| `scope` | — | enum | 仅 `"public"` |
| `kind` | — | enum | 仅 `"manual"` |
| `isDefault` | — | boolean | 默认 false。**每 discipline 至少 1 个 isDefault=true** |
| `position` | — | number | chip 排序 |
| `groups` | — | object[] | `[{id, title, flow, schoolIds[]}, ...]` |

### 3.5 Study Session 字段

| 字段 | 类型 | 必填 | 约束 |
|---|---|---|---|
| `discipline` | string | ✓ | 1-60 字符，必须 ∈ D1 已存在 discipline.key |
| `kp_id` | string | ✓ | 1-60 字符，KP 必须存在且属于 `discipline` |
| `date` | string | ✓ | `YYYY-MM-DD` |
| `start_time` | string | ✓ | `HH:mm`（24h） |
| `duration_min` | int | ✓ | 1-600 |
| `rating` | int? | — | 1-5 \| null（理解度自评） |
| `note` | string? | — | 0-2000 字（心得 / 卡点） |

---

## 4. KP API

### 4.1 `GET /api/kps?discipline=<key>` — 列表

| 参数 | 说明 |
|---|---|
| `discipline` | 目标学科 / tenant |
| `limit` | 默认 `50`，最大 `200` |
| `offset` | 默认 `0` |
| `q` | 可选，匹配 title/body 的 zh/en/ja |
| `school` | 可选，只列属于该学派的 KP |
| `scholar` | 可选，只列关联该学者的 KP |

Response 包含 `page.total` 和 `page.next_offset`（null = 已到末页）。

### 4.2 `POST /api/kps?discipline=<key>` — 创建

```bash
curl -X POST 'https://study.sususu.org/api/kps?discipline=keiei' \
  -H 'Authorization: Bearer ms_v1_xxx' \
  -H 'Content-Type: application/json' \
  -d '{
    "id": "k999",
    "title": { "zh": "需求层次理论", "ja": "欲求階層説", "en": "Hierarchy of Needs" },
    "body": { "zh": "正文", "ja": "本文" },
    "format": "narrative",
    "year": "1943",
    "schools": ["motivation"],
    "scholars": ["maslow"],
    "tags": []
  }'
```

直接写 D1 + 记录版本快照。

### 4.3 `GET /api/kps/:id` — 读单条

服务端先查 KP 所属 tenant，再校验当前用户是否可读。

### 4.4 `PATCH /api/kps/:id` — 局部更新

禁止变更 tenant；`schools` / `scholars` 必须属于同一 tenant。

### 4.5 `DELETE /api/kps/:id` — 删除

删除 KP，并在 `knowledge_point_versions` 表保留删除前快照。

### 4.6 `GET /api/kps/:id/versions` — 历史

读权限即可调用。

```json
{
  "ok": true,
  "tenant": { "tenantId": "keiei", "discipline": "keiei", "role": "editor" },
  "kp_id": "k999",
  "versions": [
    {
      "id": 12,
      "kp_id": "k999",
      "tenant_id": "keiei",
      "version": 2,
      "snapshot": { "id": "k999", "title": { "zh": "需求层次理论" } },
      "edited_by": "u_xxx",
      "created_at": "2026-05-01T00:00:00.000Z"
    }
  ]
}
```

### 4.7 `GET /api/kps/meta?discipline=<key>` — 写 KP 前查元数据

KP 写入专用快捷入口（返 schools/scholars/themes/tags/views/formats）。新代码可直接用更完整的 [`/api/metadata`](#91-get-apimetadatadisciplinekey--统一元数据)。

---

## 5. School API

### 5.1 `GET /api/schools?discipline=<key>` — 列表

| 参数 | 说明 |
|---|---|
| `discipline` | 目标学科 |
| `limit` / `offset` | 默认 50 / 0，max 200 |
| `q` | 可选，匹配 title / summary 的 zh/en/ja |
| `theme` | 可选，只列某个 theme 下的学派 |

Response:

```json
{
  "ok": true,
  "tenant": { "tenantId": "keiei", "discipline": "keiei", "role": "editor" },
  "schools": [
    {
      "key": "motivation",
      "title": { "zh": "动机理论", "en": "Motivation Theory" },
      "era": "20c",
      "summary": { "zh": "研究动机与需求的理论群。" },
      "themeKey": "organization",
      "tags": ["classic"],
      "concepts": ["k101", "k102"],
      "kp_count": 12,
      "scholar_count": 3,
      "view_count": 1,
      "createdAt": "2026-05-01T00:00:00.000Z",
      "updatedAt": "2026-05-01T00:00:00.000Z"
    }
  ],
  "page": { "limit": 50, "offset": 0, "total": 1, "next_offset": null }
}
```

### 5.2 `POST /api/schools?discipline=<key>` — 创建

`themeKey` 必须属于该学科；`concepts` 里的 KP 必须属于同一 tenant。Body 不能含 `tenant_id` / `discipline`。

```json
{
  "key": "motivation",
  "title": { "zh": "动机理论", "ja": "動機づけ理論", "en": "Motivation Theory" },
  "era": "20c",
  "summary": { "zh": "研究动机与需求的理论群。", "ja": "動機づけを扱う理論群。" },
  "themeKey": "organization",
  "tags": ["classic"],
  "concepts": ["k101", "k102"]
}
```

### 5.3 `GET /api/schools/:key?discipline=<key>` — 读

### 5.4 `PATCH /api/schools/:key?discipline=<key>` — 局部更新

禁止变更 key / tenant；`themeKey` 和 `concepts` 做同 tenant 校验。

### 5.5 `DELETE /api/schools/:key?discipline=<key>` — 删除

仅删空学派。若仍有关联 KP / Scholar / View，返 `409`。

---

## 6. Scholar API

### 6.1 `GET /api/scholars?discipline=<key>` — 列表

| 参数 | 说明 |
|---|---|
| `discipline` | 目标学科 |
| `limit` / `offset` | 默认 50 / 0，max 200 |
| `q` | 可选，匹配 name / contribution 的 zh/en/ja |
| `school` | 可选，只列关联某个 school 的学者 |

Response:

```json
{
  "ok": true,
  "tenant": { "tenantId": "keiei", "discipline": "keiei", "role": "editor" },
  "scholars": [
    {
      "key": "maslow",
      "name": { "zh": "马斯洛", "en": "Abraham Maslow" },
      "schools": ["motivation"],
      "contribution": { "zh": "提出需求层次理论。" },
      "lifespan": "1908-1970",
      "institution": "Brandeis University",
      "tags": ["classic"],
      "nobel": null,
      "kpsOrder": ["k101"],
      "kp_count": 1,
      "school_count": 1
    }
  ],
  "page": { "limit": 50, "offset": 0, "total": 1, "next_offset": null }
}
```

### 6.2 `POST /api/scholars?discipline=<key>` — 创建

`schools` 和 `kpsOrder` 里的 key/id 必须属于同一 tenant。Body 不能含 `tenant_id` / `discipline`。

```json
{
  "key": "maslow",
  "name": { "zh": "马斯洛", "ja": "マズロー", "en": "Abraham Maslow" },
  "schools": ["motivation"],
  "contribution": { "zh": "提出需求层次理论。", "ja": "欲求階層説を提唱。" },
  "lifespan": "1908-1970",
  "institution": "Brandeis University",
  "tags": ["classic"],
  "nobel": null,
  "kpsOrder": ["k101"]
}
```

### 6.3 `GET /api/scholars/:key?discipline=<key>` — 读

### 6.4 `PATCH /api/scholars/:key?discipline=<key>` — 局部更新

### 6.5 `DELETE /api/scholars/:key?discipline=<key>` — 删除

仅删未被 KP 引用的学者。仍有关联 KP 时返 `409`。

---

## 7. View API

View = "学派列表页怎么组织和分组"。只影响展示组织方式，不改 School / Scholar / KP 本体。

### 7.1 `GET /api/views?discipline=<key>` — 列表

### 7.2 `POST /api/views?discipline=<key>` — 创建

`groups[].schoolIds` 必须属于同一 tenant。Body 不能含 `tenant_id` / `discipline`。

```json
{
  "id": "default",
  "name": "默认视图",
  "jp": "デフォルト",
  "icon": "📚",
  "description": "默认分组",
  "flow": "",
  "scope": "public",
  "kind": "manual",
  "isDefault": true,
  "position": 0,
  "groups": [
    { "id": "main", "title": "主要理论", "flow": "", "schoolIds": ["motivation"] }
  ]
}
```

若 `isDefault: true`，服务端自动取消同 tenant 其它 view 的默认状态，并把当前 view 的 `position` 写为 `0`。

### 7.3 `GET /api/views/:id?discipline=<key>` — 读

### 7.4 `PATCH /api/views/:id?discipline=<key>` — 局部更新

禁止变更 id / tenant；`groups[].schoolIds` 做同 tenant 校验。

### 7.5 `DELETE /api/views/:id?discipline=<key>` — 删除

默认视图不能直接删，需先 reorder 把其它视图设为默认。

### 7.6 `POST /api/views/reorder?discipline=<key>` — 重排

`viewIds` 必须与当前 tenant 的 view 集合**完全一致**，避免误增删。

```json
{
  "viewIds": ["timeline", "default"],
  "defaultViewId": "timeline"
}
```

---

## 8. Study Log API · 学习日志

### 8.1 命名说明（先看这一节）

文档 / UI 叫「**学习日志 · Study Log**」，后端 endpoint / 数据模型叫 **`study-sessions` / `study_session`**（一条会话 = 一段时长 + KP）。两套叫法并存：UI 上一条记录就是「日志一条」，但底层是「学习 session 的时间序列」。

| 层 | 命名 | 例 |
|---|---|---|
| 用户 / 文档标题 / UI 路径 | `study-log` | `/[discipline]/study-log` |
| API endpoint | `study-sessions` | `POST /api/study-sessions` |
| D1 表 / Zod schema | `study_session` | [`src/schemas/study-session.ts`](https://github.com/Suli-Hu/Web-Project/blob/main/v2/src/schemas/study-session.ts) |

下面所有 endpoint 都以 `/api/study-sessions` 出现 — 别按 `study-log` 搜路由。

### 8.2 `GET /api/study-sessions` — 列表

```
GET /api/study-sessions?discipline=keiei&from=2026-04-01&to=2026-05-02&limit=200
```

| query | 类型 | 说明 |
|---|---|---|
| `discipline` | string? | 不传则跨学科返回（按 token scope 收窄） |
| `from` / `to` | YYYY-MM-DD? | 日期闭区间 |
| `limit` / `offset` | int? | 默认 200 / 0 |

返回：

```json
{
  "ok": true,
  "sessions": [
    { "id": "...", "discipline": "keiei", "kp_id": "k_001",
      "date": "2026-05-02", "start_time": "14:30",
      "duration_min": 30, "rating": 4, "note": "..." }
  ]
}
```

### 8.3 `POST /api/study-sessions` — 创建

Body 字段约束严格 — 见 [§3.5 Study Session 字段](#35-study-session-字段) 或 [study-session.ts](https://github.com/Suli-Hu/Web-Project/blob/main/v2/src/schemas/study-session.ts)。

成功返：

```json
{ "ok": true, "session": { "id": "...", "...": "..." } }
```

### 8.4 `GET /api/study-sessions/{id}` — 读单条

### 8.5 `PUT /api/study-sessions/{id}` — 部分更新

Body 是上述字段任意子集（**不允许改 `discipline`** — 防 session 跨学科污染段位算法）。至少 1 个字段。

### 8.6 `DELETE /api/study-sessions/{id}` — 删除

返 `{ "ok": true, "id": "..." }` 或 `404`。**不可恢复**。

### 8.7 典型对话流程

**用户**："我今天上午 9 点学了认知失调理论 30 分钟，理解度 4 星"

**Agent 内部**：

1. （可选缓存）`GET /api/metadata?discipline=keiei` 拿 KP 字典
2. 模糊匹配「认知失调理论」→ 找到 `kp_id="k_xxx"`，归属 `school="ob"`
3. POST：

   ```bash
   curl -X POST https://study.sususu.org/api/study-sessions \
     -H "Authorization: Bearer ms_v1_xxx" \
     -H "Content-Type: application/json" \
     -d '{
       "discipline": "keiei",
       "kp_id": "k_xxx",
       "date": "2026-05-02",
       "start_time": "09:00",
       "duration_min": 30,
       "rating": 4
     }'
   ```

4. 收到 `{ ok: true, session: {...} }` → 回用户「✓ 已记录，今天累计 X 分钟」

### 8.8 速率 / 配额

目前**无显式限速**。Cloudflare Workers 默认 50ms CPU/请求；D1 写入约 5-20ms。

若 agent 一次对话要写 5+ 条 session，请**串行调用**（每次 await 完成再下一次），避免 D1 写冲突或 CF 短时 burst。

---

## 9. 元数据 / 搜索 / 状态

### 9.1 `GET /api/metadata?discipline=<key>` — 统一元数据

读权限即可调用，适合 agent / admin UI 在创建 KP / School / Scholar / View 前获取完整可引用 key。

```json
{
  "ok": true,
  "tenant": { "tenantId": "keiei", "discipline": "keiei", "role": "editor" },
  "discipline": {
    "key": "keiei",
    "tenant_id": "keiei",
    "title": { "zh": "经营学", "en": "Management" },
    "tagline": { "zh": "管理学知识库" }
  },
  "formats": ["narrative", "flat-list", "accordion", "compare", "quad"],
  "tags": [{ "key": "classic", "label": { "zh": "经典" }, "color": "#007AFF" }],
  "themes": [{ "key": "organization", "title": { "zh": "组织" }, "schools": ["motivation"] }],
  "schools": [{ "key": "motivation", "themeKey": "organization", "kp_count": 12 }],
  "scholars": [{ "key": "maslow", "kp_count": 3 }],
  "views": [{ "id": "default", "name": "默认视图", "isDefault": true }]
}
```

### 9.2 `GET /api/search/<discipline>?q=<keyword>` — 全文搜索

无需认证（公开学科）。

| query | 说明 |
|---|---|
| `q` | 关键词（≥3 字符走 FTS5 + BM25 + snippet 高亮，<3 走 LIKE） |

```json
{
  "kps": [
    { "id": "k628", "title_zh": "组织开发（OD）", "title_en": "...", "title_ja": "...",
      "year": "1969", "excerpt_zh": "...<mark>OD</mark>...", "excerpt_ja": "...",
      "scholars_csv": "beckhard", "schools_csv": "change,hrm" }
  ],
  "scholars": [{ "key": "...", "name_zh": "...", "kp_count": 5 }],
  "schools": [{ "key": "...", "title_zh": "...", "kp_count": 12 }]
}
```

### 9.3 `GET /api/v1/index/<discipline>` — 学科 manifest

一次拿到该学科全景（themes / schools / scholars / kps）。learning agent 会话开局**强烈建议先调一次**，跨 session 接力 / 防重复扫描 / 写新 KP 前确认 schools[] / scholars[] key 拼写都靠这个。

**Auth**: Bearer token 或 cookie，且 `canRead(discipline)` = true。

```json
{
  "ok": true,
  "discipline": { "key": "marketing", "title_zh": "市场营销学", "title_ja": "...", "title_en": "..." },
  "counts": { "themes": 4, "schools": 12, "scholars": 25, "kps": 87 },
  "themes": [
    { "key": "marketing_strategy", "title": { "zh": "战略与定位" }, "desc": { "zh": "..." }, "schools": ["stp", "porter_generic"] }
  ],
  "schools": [
    { "key": "stp", "title_zh": "STP 战略学派", "era": "1956–", "theme_key": "marketing_strategy", "kp_count": 7 }
  ],
  "scholars": [
    { "key": "kotler", "name_zh": "菲利普·科特勒", "name_en": "Philip Kotler", "kp_count": 12 }
  ],
  "kps": [
    { "id": "m001", "title_zh": "市场细分", "year": "1956",
      "format": "narrative", "schools": ["stp"], "scholars": ["smith_w"] }
  ]
}
```

### 9.4 `GET /api/sync-status` — 最近 D1 sync 时间

无需认证。编辑器保存后前端 polling 用。

```json
{
  "latest_ran_at": "2026-04-28T10:38:00.000Z",
  "latest_commit_sha": "abc123..."
}
```

---

## 10. 错误码总表

所有错误统一返：

```json
{
  "ok": false,
  "reason": "<machine-readable-code>",
  "detail": "<human-readable string or object>"
}
```

| reason | HTTP | 含义 |
|---|---:|---|
| `bad_request` | 400 | 请求格式错（缺字段 / 路径不匹配 / invalid JSON） |
| `invalid_input` | 400 | Zod 校验失败，`detail` 是 path/message 数组 |
| `discipline_required_for_super_admin` | 400 | super-admin 未指定 discipline |
| `discipline_required_for_multi_tenant_user` | 400 | 用户有多个学科权限，必须指定 discipline |
| `kp_discipline_mismatch` | 400 | KP 不属于指定 discipline |
| `path_json_mismatch` | 400 | URL 里 id/discipline 与 JSON 不一致（git-sync 路径） |
| `not_authenticated` | 401 | 未登录或 token 无效/缺失/撤销/过期 |
| `not_admin` | 403 | 没登录或不是 admin（旧路径） |
| `not_viewer` | 403 | 没有读取该 tenant 的权限 |
| `not_editor` | 403 | 没有写入该 tenant 的权限 |
| `tenant_mismatch` | 403 | 请求试图操作其它 tenant 的资源 |
| `not_found` | 404 | session id 不存在或非该 user 拥有 |
| `kp_not_found` | 404 | KP 不存在或已删除 |
| `school_not_found` | 404 | School 不存在 |
| `scholar_not_found` | 404 | Scholar 不存在 |
| `view_not_found` | 404 | View 不存在 |
| `tenant_not_found` | 404 | discipline / tenant 不存在 |
| `not_found_in_git` | 404 | GitHub repo 里没这个文件（git-sync 路径） |
| `kp_id_exists` | 409 | 创建时 KP id 已存在 |
| `school_key_exists` | 409 | 创建时 school key 已存在 |
| `scholar_key_exists` | 409 | 创建时 scholar key 已存在 |
| `view_id_exists` | 409 | 创建时 view id 已存在 |
| `school_has_kps` | 409 | 删除前需要先移走或删除关联 KP |
| `school_has_scholars` | 409 | 删除前需要先移走或删除关联 Scholar |
| `school_used_in_views` | 409 | 删除前需要先从 View 中移除 |
| `scholar_has_kps` | 409 | 删除前需要先移走或删除关联 KP |
| `view_is_default` | 409 | 删除前需要先把其它 view 设为默认 |
| `sha_conflict` | 409 | 编辑器路径专属，base_sha 与远端不一致（乐观锁） |
| `schema_invalid` | 422 | 请求 JSON 不符合 schema |
| `school_not_in_tenant` | 422 | schools 引用了该学科不存在的 key |
| `scholar_not_in_tenant` | 422 | scholars 引用了该学科不存在的 key |
| `theme_not_in_tenant` | 422 | themeKey 引用了该学科不存在的 key |
| `concept_not_in_tenant` | 422 | concepts 引用了该学科不存在的 KP |
| `view_ids_mismatch` | 422 | 重排 view 时提交集合必须等于当前 view 集合 |
| `d1_write_failed` | 500 | D1 写入异常 |
| `config_missing` | 503 | 服务端 env var 没配（如 D1 binding） |
| `github_error` | 502 | GitHub API 调用失败（git-sync 路径） |
| `invalid_signature` | 403 | webhook HMAC 验签失败 |

调用方建议先做一次 dry-run（POST 少量数据）确认 schema 没漂移，再批量调用。

---

## 11. Agent 调用配方

### 11.1 安全新建 KP（防重复）

```
1. GET /api/kps?discipline=<disc>&q=<标题关键词>
   - 若返的 kps[] 有标题相似度高的，停下问 user
2. （可选）GET /api/metadata?discipline=<disc> 拿 schools/scholars 字典
3. POST /api/kps?discipline=<disc> 直接写入
4. 把 response 里 KP id 拼成 public_url 给 user：
   https://study.sususu.org/<disc>/kp/<id>
```

### 11.2 移动 scholar 到另一个 school

```
1. PATCH /api/scholars/<key>?discipline=<disc>
   body: { "schools": ["new_school"], "schoolsExplicit": true }
2. （可选）PATCH /api/schools/<old>?discipline=<disc> 改 concepts[]
   PATCH /api/schools/<new>?discipline=<disc> 改 concepts[]
```

### 11.3 删 KP

```
1. DELETE /api/kps/<id>
   - 服务端自动 cascade kp_school / kp_scholar，并保留版本快照
2. 受影响的 schools.concepts[] / scholars.kpsOrder[] 数组里残留的 id 是 cosmetic，
   会在下次该 school/scholar PATCH 时清掉。也可手动 PATCH 一次清掉。
```

### 11.4 合并两个 KP

```
1. 决定合并方向（保留谁的 id）
2. PATCH /api/kps/<keep> — body 合入另一个的内容
3. DELETE /api/kps/<drop>
4. （可选）PATCH 受影响的 schools / scholars 清掉 drop id 残留
```

---

## 12. Deprecated · git-sync 兜底

> ⚠️ **以下端点保留给迁移期使用，新代码请走前面的 API-first 路径。**
>
> 历史背景：v0.5.x 之前业务数据写入路径是「写 JSON → git push → webhook 同步 D1」。v0.5.95+ API-first 直接写 D1 后，git-sync 不再是默认路径。

### 12.1 sync APIs

#### `POST /api/v1/sync/<type>/<discipline>/<idOrKey>`

从 GitHub 拉文件 + zod 校验 + upsert D1。

- `type` ∈ `kp` / `school` / `scholar` / `view`
- Auth: admin cookie 或 bearer token + `canEdit(discipline)`
- Request body: 空（资源数据从 git 拉）

```bash
curl -X POST -H "Authorization: Bearer $MS_TOKEN" \
  https://study.sususu.org/api/v1/sync/kp/keiei/k628
```

Response 200:

```json
{
  "ok": true,
  "type": "kp",
  "discipline": "keiei",
  "id_or_key": "k628",
  "title_zh": "组织开发（OD）",
  "commit_sha": "abc123def456...",
  "d1_synced_at": "2026-04-28T10:38:00.000Z",
  "public_url": "https://study.sususu.org/keiei/kp/k628"
}
```

#### `DELETE /api/v1/sync/<type>/<discipline>/<idOrKey>`

D1 删该资源（含 join 表 cascade）。**不**去 GitHub 拉文件 — git 那边应已删。

#### `POST /api/sync-kp-from-git/<discipline>/<id>`

仅 KP，向后兼容旧 alias。新代码用 `/api/v1/sync/kp/...`。

### 12.2 GitHub Webhook

#### `POST /api/v1/webhook/github`

GitHub repo 配的 webhook，所有 push 到 main 自动触发对应 sync / delete。

- Auth: HMAC SHA-256 验签（`X-Hub-Signature-256` header），用 `GITHUB_WEBHOOK_SECRET` env var 比对
- 只响应 push event + main 分支
- 文件路径 match `v2/data/<discipline>/(kp|schools|scholars|views)/<id>.json` 才处理
- `added` / `modified` → upsert；`removed` → delete
- 单条失败不阻断其它

**一次性配置**（admin 做）：

1. 生成 secret：`openssl rand -hex 32`
2. CF Pages Settings → Environment Variables → 加 `GITHUB_WEBHOOK_SECRET`（Production，加密类型）→ 触发 redeploy
3. GitHub repo Settings → Webhooks → Add webhook：
   - URL: `https://study.sususu.org/api/v1/webhook/github`
   - Content type: `application/json`
   - Secret: 同步骤 1
   - Events: 只选 `push`
4. GitHub 立刻发 ping 测试连通，看 Recent Deliveries 应是 200 + `{"ok":true,"msg":"pong"}`

### 12.3 旧 admin UI 写路径

走 git + D1 双写。给浏览器 admin UI 用，agent 不应该碰（用 [§4-§7 API-first](#4-kp-api) 替代）。

| 资源 | new POST | edit GET/PUT/DELETE |
|---|---|---|
| KP | `/api/new/kp` | `/api/edit/kp/<id>` |
| School | `/api/new/school` | `/api/edit/school/<key>` |
| Scholar | `/api/new/scholar` | `/api/edit/scholar/<discipline>/<key>` |
| View | `/api/new/view` | `/api/edit/view/<discipline>/<id>` |
| Theme | `/api/new/theme` | `/api/edit/theme/<discipline>/<key>` |

PUT body 带乐观锁 `base_sha`（不一致返 `409 sha_conflict`）。

#### `PUT /api/edit/discipline/<discipline>/tags`

全量替换该学科的标签库。

```json
{
  "tags": [
    { "key": "t_xxx", "label": { "zh": "...", "ja": "..." }, "color": "#34C759", "description": "..." }
  ],
  "base_sha": "abc..."
}
```

#### Reorder 端点

| Endpoint | 用途 |
|---|---|
| POST `/api/edit/reorder/discipline-schools` | 改某 discipline 下学派的排序 |
| POST `/api/edit/reorder/school-concepts` | 改某 school.concepts[] 的 KP 顺序 |
| POST `/api/edit/reorder/scholar-kps` | 改某 scholar.kpsOrder[] |
| POST `/api/edit/reorder/views` | 改 view chip 排序（API-first 等价：`POST /api/views/reorder`） |
| POST `/api/edit/reorder/themes-order` | 改 discipline.themes[] 顺序 |

---

## 13. 真值参照

| 文档 / 路径 | 用途 |
|---|---|
| [Main/CLAUDE.md](https://github.com/Suli-Hu/Web-Project/blob/main/Main/CLAUDE.md) | 项目核心规则、所有 session 启动必读 |
| [Main/CONTRIBUTING.md](https://github.com/Suli-Hu/Web-Project/blob/main/Main/CONTRIBUTING.md) | 设计哲学 + KP 三层架构 + 日文对照 + 部署规范 |
| [v2/public/docs/learning-kp-guide.md](learning-kp-guide.md) | 7 步上传流程、5 种 format 详解、agent 反馈话术 |
| [v2/src/schemas/](https://github.com/Suli-Hu/Web-Project/tree/main/v2/src/schemas) | KP / School / Scholar / View / Discipline / Study Session zod schema 真源 |
| [v2/src/lib/body-parser.ts](https://github.com/Suli-Hu/Web-Project/blob/main/v2/src/lib/body-parser.ts) | 5 种 format 的 body string 解析逻辑 |
| [v2/src/lib/sync-resource.ts](https://github.com/Suli-Hu/Web-Project/blob/main/v2/src/lib/sync-resource.ts) | git→D1 sync helper（webhook 与 sync API 共用） |
| [v2/data/keiei/kp/_template.*.json](https://github.com/Suli-Hu/Web-Project/tree/main/v2/data/keiei/kp) | 5 种 format 各 1 个 example，copy 起手 |

---

— 文档跟随当前 main 分支同步。schema 改动以 [src/schemas/](https://github.com/Suli-Hu/Web-Project/tree/main/v2/src/schemas) 为单一来源。
