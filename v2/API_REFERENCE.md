# API Reference (Claude Code agent 视角)

> **API-first migration note**：新写入路径是 `GET/POST /api/kps`、
> `GET/PATCH/DELETE /api/kps/:id`、`GET/POST /api/schools` 与
> `GET/PATCH/DELETE /api/schools/:key`、`GET/POST /api/scholars` 与
> `GET/PATCH/DELETE /api/scholars/:key`。旧的 GitHub JSON sync / edit 端点仍可用，
> 但已标记 deprecated，只作为迁移期兜底。

---

## API-first endpoints

### Agent 调用流程

1. 用 `/admin/tokens` 给目标用户创建 API token。
2. 调 `GET /api/me` 确认 token 身份、scope、可读/可写学科。
3. 调 `GET /api/kps/meta?discipline=<key>` 获取可用 `schools` / `scholars` / `tags` / `formats`。
4. 如需先建学派，调 `POST /api/schools?discipline=<key>`。
5. 如需先建学者，调 `POST /api/scholars?discipline=<key>`。
6. 调 `POST /api/kps?discipline=<key>` 创建 KP。
7. 调 `GET /api/kps/:id` 或 `GET /api/kps?discipline=<key>&q=<title>` 确认写入结果。
8. 如需审计，调 `GET /api/kps/:id/versions` 查看历史快照。

### Tenant 选择与权限

请求可以用 `?discipline=keiei` 或 `x-discipline-key: keiei` 指定目标学科。
服务端会用当前 session / API token 校验该用户是否属于这个 tenant，并在写入时
强制注入 `tenant_id`、`created_by`、`updated_by`。请求 body 里的
`tenant_id` / `discipline` 不会被接受为业务数据源。

角色映射：

| role | 权限 |
|---|---|
| `owner` | 全部 |
| `editor` | KP CRUD |
| `viewer` | 只读 |

迁移期兼容：旧 `user_permission.admin` 视为可写，`user_permission.guest` 视为只读。
超级管理员如果使用带 scope 的 API token，也会受 token scope 收窄限制。
现有 `/admin/users` 权限后台会同时维护旧 `user_permission` 和新 `tenant_member`。

### `GET /api/me`

给外部 agent 的 token 自检端点。它只读取服务端 auth context，不接受客户端传入身份。

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

### `GET /api/kps/meta?discipline=<key>`

返回创建 KP 前需要引用的学科元数据。读权限即可调用，适合 agent 在生成 KP JSON 前先拿合法 key。

```bash
curl 'https://study.sususu.org/api/kps/meta?discipline=keiei' \
  -H 'Authorization: Bearer ms_v1_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'
```

Response:

```json
{
  "ok": true,
  "tenant": { "tenantId": "keiei", "discipline": "keiei", "role": "editor" },
  "formats": ["narrative", "flat-list", "accordion", "compare", "quad"],
  "tags": [{ "key": "classic", "label": { "zh": "经典" }, "color": "#007AFF" }],
  "schools": [
    { "key": "motivation", "title": { "zh": "动机理论", "en": "Motivation Theory" }, "tags": ["classic"], "kp_count": 12 }
  ],
  "scholars": [
    { "key": "maslow", "name": { "zh": "马斯洛", "en": "Abraham Maslow" }, "tags": ["classic"], "kp_count": 3 }
  ]
}
```

### `GET /api/kps?discipline=<key>`

列出当前 tenant 的 KP。

Query：

| 参数 | 说明 |
|---|---|
| `discipline` | 目标学科 / tenant |
| `limit` | 默认 `50`，最大 `200` |
| `offset` | 默认 `0` |
| `q` | 可选，匹配 title/body 的 zh/en/ja |
| `school` | 可选，只列属于该学派的 KP |
| `scholar` | 可选，只列关联该学者的 KP |

Response 里会返回 `page.total` 和 `page.next_offset`。

### `POST /api/kps?discipline=<key>`

直接写入 D1，创建 KP，并记录版本快照。

```json
{
  "id": "k999",
  "title": { "zh": "需求层次理论", "ja": "欲求階層説", "en": "Hierarchy of Needs" },
  "body": { "zh": "正文", "ja": "本文" },
  "format": "narrative",
  "year": "1943",
  "schools": ["motivation"],
  "scholars": ["maslow"],
  "tags": []
}
```

Bearer token 调用示例：

```bash
curl -X POST 'https://study.sususu.org/api/kps?discipline=keiei' \
  -H 'Authorization: Bearer ms_v1_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' \
  -H 'Content-Type: application/json' \
  -d '{
    "title": { "zh": "需求层次理论", "ja": "欲求階層説", "en": "Hierarchy of Needs" },
    "body": { "zh": "正文", "ja": "本文" },
    "format": "narrative",
    "year": "1943",
    "schools": ["motivation"],
    "scholars": ["maslow"],
    "tags": []
  }'
```

### `GET /api/kps/:id`

读取单个 KP。服务端先查 KP 所属 tenant，再校验当前用户是否可读。

### `PATCH /api/kps/:id`

局部更新 KP。禁止变更 tenant；`schools` / `scholars` 必须属于同一 tenant。

### `DELETE /api/kps/:id`

删除 KP，并在 `knowledge_point_versions` 保留删除前快照。

### `GET /api/kps/:id/versions`

查看单个 KP 的历史快照。读权限即可调用。

```bash
curl 'https://study.sususu.org/api/kps/k999/versions' \
  -H 'Authorization: Bearer ms_v1_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'
```

Response:

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

### API-first 错误码

| reason | HTTP | 含义 |
|---|---:|---|
| `not_authenticated` | 401 | 未登录或 token 无效 |
| `discipline_required_for_super_admin` | 400 | super-admin 未指定 discipline |
| `discipline_required_for_multi_tenant_user` | 400 | 用户有多个学科权限，必须指定 discipline |
| `tenant_not_found` | 404 | discipline / tenant 不存在 |
| `not_viewer` | 403 | 没有读取该 tenant 的权限 |
| `not_editor` | 403 | 没有写入该 tenant 的权限 |
| `schema_invalid` | 422 | 请求 JSON 不符合 schema |
| `kp_id_exists` | 409 | 创建时 KP id 已存在 |
| `kp_not_found` | 404 | KP 不存在或已删除 |
| `school_key_exists` | 409 | 创建时 school key 已存在 |
| `school_not_found` | 404 | School 不存在 |
| `scholar_key_exists` | 409 | 创建时 scholar key 已存在 |
| `scholar_not_found` | 404 | Scholar 不存在 |
| `school_not_in_tenant` | 422 | schools 引用了该学科不存在的 key |
| `scholar_not_in_tenant` | 422 | scholars 引用了该学科不存在的 key |
| `theme_not_in_tenant` | 422 | themeKey 引用了该学科不存在的 key |
| `concept_not_in_tenant` | 422 | concepts 引用了该学科不存在的 KP |
| `school_has_kps` | 409 | 删除 school 前需要先移走或删除关联 KP |
| `school_has_scholars` | 409 | 删除 school 前需要先移走或删除关联 Scholar |
| `school_used_in_views` | 409 | 删除 school 前需要先从 View 中移除 |
| `scholar_has_kps` | 409 | 删除 scholar 前需要先移走或删除关联 KP |
| `tenant_mismatch` | 403 | 请求试图操作其它 tenant 的 KP |

> **谁该读**：在任意 worktree / 任意 Claude Code session 想以编程方式管理知识库的 agent。
> 主要场景：写完 git → 让 D1 立即同步 / 读列表防重复 / 删除前查级联 / 元数据查询。

---

## API-first School endpoints

School 是“学派/知识分类”的数据库写入入口。新学科负责人可以通过 token 直接创建和维护学派，不需要走 Git。

### `GET /api/schools?discipline=<key>`

列出当前 tenant 的学派。读权限即可调用。

Query：

| 参数 | 说明 |
|---|---|
| `discipline` | 目标学科 / tenant |
| `limit` | 默认 `50`，最大 `200` |
| `offset` | 默认 `0` |
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

### `POST /api/schools?discipline=<key>`

直接写入 D1，创建学派。`themeKey` 必须属于该学科；`concepts` 里的 KP 必须属于同一 tenant。
请求 body 不能包含 `tenant_id` 或 `discipline`。

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

### `GET /api/schools/:key?discipline=<key>`

读取单个学派。需要指定 `discipline`，服务端会校验当前用户是否可读该 tenant。

### `PATCH /api/schools/:key?discipline=<key>`

局部更新学派。禁止变更 key / tenant；`themeKey` 和 `concepts` 会做同 tenant 校验。

### `DELETE /api/schools/:key?discipline=<key>`

删除空学派。若该学派仍有关联 KP、Scholar 或 View，会返回 `409`，避免误删导致页面断裂。

## API-first Scholar endpoints

Scholar 是“学者/理论贡献者”的数据库写入入口。新学科负责人可以通过 token 直接创建和维护学者，不需要走 Git。

### `GET /api/scholars?discipline=<key>`

列出当前 tenant 的学者。读权限即可调用。

Query：

| 参数 | 说明 |
|---|---|
| `discipline` | 目标学科 / tenant |
| `limit` | 默认 `50`，最大 `200` |
| `offset` | 默认 `0` |
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
      "born": "1908",
      "died": "1970",
      "nationality": "美国",
      "field": "心理学",
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

### `POST /api/scholars?discipline=<key>`

直接写入 D1，创建学者。`schools` 和 `kpsOrder` 里的 key/id 必须属于同一 tenant。
请求 body 不能包含 `tenant_id` 或 `discipline`。

```json
{
  "key": "maslow",
  "name": { "zh": "马斯洛", "ja": "マズロー", "en": "Abraham Maslow" },
  "schools": ["motivation"],
  "contribution": { "zh": "提出需求层次理论。", "ja": "欲求階層説を提唱。" },
  "lifespan": "1908-1970",
  "institution": "Brandeis University",
  "born": "1908",
  "died": "1970",
  "nationality": "美国",
  "field": "心理学",
  "tags": ["classic"],
  "nobel": null,
  "kpsOrder": ["k101"]
}
```

### `GET /api/scholars/:key?discipline=<key>`

读取单个学者。需要指定 `discipline`，服务端会校验当前用户是否可读该 tenant。

### `PATCH /api/scholars/:key?discipline=<key>`

局部更新学者。禁止变更 key / tenant；`schools` 和 `kpsOrder` 会做同 tenant 校验。

### `DELETE /api/scholars/:key?discipline=<key>`

删除未被 KP 引用的学者。若该学者仍有关联 KP，会返回 `409`。

## 0. TL;DR — 9 成场景就这一句话

**新流程：agent 通过 API token 直接写数据库，不需要改 GitHub JSON。**

```
GET /api/me
↓
GET /api/kps/meta?discipline=<key>
↓
POST /api/schools?discipline=<key>   （需要新学派时）
↓
POST /api/scholars?discipline=<key>  （需要新学者时）
↓
POST /api/kps?discipline=<key>
↓
线上读接口直接从 D1 读到新数据
```

旧的 GitHub JSON / webhook / sync 流程仍保留在后文作为迁移期说明。

如果 webhook 没配，或者要立即触发不等：调 `/api/v1/sync/<type>/<disc>/<idOrKey>` POST 一次，~3s 生效。

---

## 1. 基础约定

### Base URL
```
Production:  https://management-study-v2.pages.dev
```

### 认证

当前认证方式：**admin cookie session**。
- 在浏览器登录站点（admin 邮箱：`husuli0623@gmail.com`）后，cookie 里有 session
- agent 调写操作 endpoint 时需要带这个 cookie

获取 cookie 方式（agent 让 user 提供）：
```js
// 浏览器 console 跑
document.cookie
// 复制输出给 agent
```

调用方式：
```bash
curl -X POST \
  -H "Cookie: ms_session=...; ms_user=..." \
  -H "Content-Type: application/json" \
  -d '...' \
  https://management-study-v2.pages.dev/api/v1/...
```

> **路线图**：v0.5.95 起会加 API token（`Authorization: Bearer ms_v1_<32hex>`），关联到具体 user + 复用 [user_permission](migrations/0008_user_permission.sql) 表的 per-discipline RBAC。Token 在 `/admin/tokens` 生成。

### 公开 vs 受保护

| 类型 | 例子 | 认证 |
|---|---|---|
| 读公开数据 | `GET /api/sync-status`、`GET /api/search/<disc>` | 无需 |
| 写数据 / 删除 / sync | `POST /api/v1/sync/...`、`PUT /api/edit/kp/...`、`POST /api/new/kp` | admin cookie 或 token |
| Webhook | `POST /api/v1/webhook/github` | HMAC SHA-256 验签（GitHub 发） |

### 错误格式

所有写 endpoint 错误返：

```json
{
  "ok": false,
  "reason": "<machine-readable-code>",
  "detail": "<human-readable 字符串或对象>"
}
```

常见 reason：
- `not_admin` — 没登录或不是 admin
- `config_missing` — 服务端 env var 没配
- `bad_request` — 请求格式错（缺字段 / 路径不匹配）
- `schema_invalid` — JSON 通过但 zod 校验失败，detail 是 zod issues 数组
- `path_json_mismatch` — URL 里的 id / discipline 跟 JSON 内字段不一致
- `not_found_in_git` — GitHub repo 里没这个文件
- `github_error` — GitHub Contents API 调用失败
- `d1_write_failed` — D1 写入异常
- `sha_conflict` — 编辑器路径专属，base_sha 与远端不一致（乐观锁）
- `invalid_signature` — webhook HMAC 验签失败

---

## 2. 资源类型 & 字段

四种资源都存在 `v2/data/<discipline>/<dir>/<id>.json`，**单文件 = 单条**。

| 资源 | 目录 | id 字段 | id 格式 | discipline 字段 |
|---|---|---|---|---|
| KP 知识点 | `kp/` | `id` | `^[a-z]{1,3}\d+$`（如 `k628`） | `discipline` |
| School 学派 | `schools/` | `key` | `^[a-z][a-z0-9_]*$`（如 `change`） | `discipline` |
| Scholar 学者 | `scholars/` | `key` | `^[a-z][a-z0-9_]*$`（如 `beckhard`） | `discipline` |
| View 视图 | `views/` | `id` | `^[a-z][a-z0-9_-]*$`（如 `motivation`） | `discipline` |

完整字段定义见 [v2/src/schemas/](src/schemas/) — kp.ts / school.ts / scholar.ts / view.ts。

### 2.1 KP 字段

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `id` | ✓ | string | KP id，全 discipline 内唯一 |
| `discipline` | ✓ | enum | `keiei` / `marketing` / `sociology` / `finance` / `hr` / `strategy_g` / `org_g` / `other` |
| `schools` | ✓ | string[] | ≥1 个，必须 ∈ schools 目录的 key |
| `scholars` | — | string[] | 默认 []，必须 ∈ scholars 目录的 key |
| `year` | ✓ | string | 默认 ""，如 `"1959"`、`"1980s"` |
| `title.zh` | ✓ | string | 中文标题 |
| `title.en` / `title.ja` | — | string | 可选 |
| `body.zh` | ✓ | string | 中文正文，结构跟 format 匹配 |
| `body.ja` | — | string | 日文正文（强烈建议同步翻译） |
| `tags` | — | string[] | 颜色标签数组，引用 discipline.tags[].key |
| `format` | ✓ | enum | `narrative` / `flat-list` / `accordion` / `compare` / `quad` |
| `evalContent.zh` | — | object | `{义,限,例,应,用,喻}` 结构化评价（中文） |
| `evalContent.ja` | — | object | `{義,限,例,応,用,喩}` 结构化评价（日文） |
| `createdAt` | ✓ | ISO 8601 | UTC，如 `"2026-04-28T00:00:00.000Z"` |
| `updatedAt` | ✓ | ISO 8601 | 同上 |

**body 5 种 format 的字符串结构**：见 [v2/LEARNING_KP_GUIDE.md §3](LEARNING_KP_GUIDE.md)。

完整 zod schema：[v2/src/schemas/kp.ts](src/schemas/kp.ts)。

### 2.2 School 字段

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `key` | ✓ | string | 学派 key |
| `discipline` | ✓ | enum | 同 KP |
| `title.zh` | ✓ | string | 学派中文名 |
| `title.en` / `title.ja` | — | string | 可选 |
| `era` | — | string | 默认 ""，如 `"1947– 变革管理理论传统"` |
| `summary.zh` | ✓ | string | 学派概述 |
| `summary.ja` | — | string | 日文概述 |
| `themeKey` | ✓ | string | 必须 ∈ `discipline.themes[].key`（验证错会 fail） |
| `tags` | — | string[] | 颜色标签 |
| `concepts` | — | string[] | 该学派下 KP id 列表，决定渲染顺序（默认 []） |
| `createdAt` | ✓ | ISO 8601 | |
| `updatedAt` | ✓ | ISO 8601 | |

完整 zod schema：[v2/src/schemas/school.ts](src/schemas/school.ts)。

### 2.3 Scholar 字段

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `key` | ✓ | string | 学者 key |
| `discipline` | ✓ | enum | |
| `name.zh` | ✓ | string | 中文名 |
| `name.en` / `name.ja` | — | string | 可选 |
| `schools` | — | string[] | 主属学派（默认 []） |
| `schoolsExplicit` | — | boolean | 默认 false。**API 写入时设 true** = schools[] 是真源，sync 跳过 KP 反向派生 |
| `contribution.zh` | ✓ | string | 学者贡献中文 |
| `contribution.ja` | — | string | 日文 |
| `lifespan` | — | string | 兜底字段，"1890–1947" |
| `institution` | — | string | 代表机构 |
| `born` / `died` / `nationality` / `flag` / `origin` / `field` | — | string | v1 兼容字段 |
| `tags` | — | string[] | 颜色标签 |
| `nobel` | — | object \| null | `{year, detail}` 或 null |
| `kpsOrder` | — | string[] | 该学者下 KP 渲染顺序（默认 []） |
| `createdAt` | ✓ | ISO 8601 | |
| `updatedAt` | ✓ | ISO 8601 | |

完整 zod schema：[v2/src/schemas/scholar.ts](src/schemas/scholar.ts)。

### 2.4 View 字段

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `id` | ✓ | string | 视图 id |
| `discipline` | ✓ | enum | |
| `name` | ✓ | string | 视图名（中文） |
| `jp` | — | string | 视图日文名 |
| `icon` | ✓ | string | emoji（如 `📚`） |
| `description` | — | string | 视图说明 |
| `flow` | — | string | 演进主线小字 |
| `scope` | — | enum | 仅 `"public"`（v0.5.66 设计未启用 private） |
| `kind` | — | enum | 仅 `"manual"`（v0.5.66 设计未启用 auto） |
| `isDefault` | — | boolean | 默认 false。**每 discipline 至少 1 个 isDefault=true** |
| `position` | — | number | chip 排序，越小越靠左 |
| `groups` | — | object[] | `[{id, title, flow, schoolIds[]}, ...]` |
| `createdAt` | ✓ | ISO 8601 | |
| `updatedAt` | ✓ | ISO 8601 | |

完整 zod schema：[v2/src/schemas/view.ts](src/schemas/view.ts)。

---

## 3. Sync APIs (v0.5.92 / v0.5.93)

git path agent 用，让 D1 ~3s 生效。

### 3.1 POST `/api/v1/sync/<type>/<discipline>/<idOrKey>`

从 GitHub 拉文件 + zod 校验 + upsert D1。

**Path params**：
- `type` ∈ `kp` / `school` / `scholar` / `view`
- `discipline` 学科 key
- `idOrKey` KP id 或 school/scholar/view 的 key/id

**Auth**: admin cookie。

**Request body**: 空（POST 不带 body，资源数据从 git 拉）。

**Response 200**:
```json
{
  "ok": true,
  "type": "kp",
  "discipline": "keiei",
  "id_or_key": "k628",
  "title_zh": "组织开发（OD）",
  "commit_sha": "abc123def456...",
  "d1_synced_at": "2026-04-28T10:38:00.000Z",
  "public_url": "https://management-study-v2.pages.dev/keiei/kp/k628"
}
```

**Response 错误**:
- `404 not_found_in_git` — git 上没这个文件
- `422 schema_invalid` — JSON 不符 zod schema
- `400 path_json_mismatch` — URL 里 id/discipline 与 JSON 不一致
- `502 github_error` — GitHub API 调用失败
- `500 d1_write_failed` — D1 写入异常

**curl 例**：
```bash
curl -X POST \
  -H "Cookie: <session>" \
  https://management-study-v2.pages.dev/api/v1/sync/kp/keiei/k628
```

---

### 3.2 DELETE `/api/v1/sync/<type>/<discipline>/<idOrKey>`

D1 删该资源（含 join 表 cascade）。**不**去 GitHub 拉文件 — git 那边应已删。

**Auth**: admin cookie。

**Response 200**:
```json
{
  "ok": true,
  "type": "school",
  "discipline": "keiei",
  "id_or_key": "deprecated_school",
  "d1_synced_at": "2026-04-28T10:40:00.000Z"
}
```

**curl 例**：
```bash
curl -X DELETE \
  -H "Cookie: <session>" \
  https://management-study-v2.pages.dev/api/v1/sync/school/keiei/old_school
```

---

### 3.3 旧 alias `/api/sync-kp-from-git/<discipline>/<id>` (v0.5.92)

仅 KP，向后兼容。新代码用 `/api/v1/sync/kp/...` 替代。

```bash
curl -X POST \
  -H "Cookie: <session>" \
  https://management-study-v2.pages.dev/api/sync-kp-from-git/keiei/k628
```

---

## 4. Webhook (v0.5.93)

### 4.1 POST `/api/v1/webhook/github`

GitHub repo 配的 webhook。配好后所有 push 到 main 自动触发对应 sync / delete。

**Auth**: HMAC SHA-256 验签（`X-Hub-Signature-256` header），用 `GITHUB_WEBHOOK_SECRET` env var 比对。

**只响应 push event + main 分支**，其它返 `{ ok: true, msg: "..." }` 直接忽略。

**解析逻辑**：
- 累加所有 commit 的 `added` / `modified` / `removed` 文件
- 文件路径 match `v2/data/<discipline>/(kp|schools|scholars|views)/<id>.json` 才处理
- `added` / `modified` → 调 `syncResource`（upsert D1）
- `removed` → 调 `deleteResource`（删 D1）
- 单条失败不阻断其它

**Response 200** (示例)：
```json
{
  "ok": true,
  "head_commit": "abc123...",
  "synced_count": 2,
  "skipped_count": 0,
  "failed_count": 0,
  "synced": [
    { "op": "upsert", "ok": true, "type": "kp", "discipline": "keiei", "id_or_key": "k628", "title_zh": "..." }
  ],
  "failed": [],
  "skipped": []
}
```

### 4.2 一次性配置（admin 做）

1. 生成 secret：`openssl rand -hex 32`
2. CF Pages Settings → Environment Variables → 加 `GITHUB_WEBHOOK_SECRET`（Production，加密类型）→ 触发 redeploy
3. GitHub repo Settings → Webhooks → Add webhook：
   - URL: `https://management-study-v2.pages.dev/api/v1/webhook/github`
   - Content type: `application/json`
   - Secret: 同步骤 1
   - Events: 只选 `push`
4. GitHub 立刻发 ping 测试连通，看 Recent Deliveries 应是 200 + `{"ok":true,"msg":"pong"}`

---

## 5. Edit APIs（admin UI 用，agent 也能调）

走 git + D1 双写（v0.5.89/91）— 跟 sync APIs 不同：sync 是"git 已写好 → 同步 D1"，edit 是"API 同时写 git + D1"。

如果 agent 不想自己 git commit + push，可以直接调 edit APIs（API 帮你 commit）。

### 5.1 KP

#### POST `/api/new/kp`
新建 KP。

**Body**: 完整 KP JSON（见 §2.1）。`createdAt` / `updatedAt` 服务端会强制刷为 now，可不填。

**Response 200**:
```json
{
  "ok": true,
  "commit_sha": "abc...",
  "new_blob_sha": "def...",
  "deploy_eta_seconds": 90
}
```

注：`deploy_eta_seconds: 90` 是历史字段，实际 ~3s 生效（v0.5.89 起 D1 双写）。

#### GET `/api/edit/kp/<id>`
读 KP（带 base_sha）。

**Response 200**:
```json
{
  "ok": true,
  "json": { /* 完整 KP */ },
  "base_sha": "abc...",
  "progress_count": 12,
  "note_count": 3,
  "tag_library": [ /* discipline.tags */ ]
}
```

#### PUT `/api/edit/kp/<id>`
更新 KP。

**Body**:
```json
{
  "json": { /* 完整 KP */ },
  "base_sha": "abc..."
}
```

`base_sha` 是乐观锁：来自上次 GET 返的 `base_sha`，不一致会返 `409 sha_conflict`。

#### DELETE `/api/edit/kp/<id>`

**Body**:
```json
{ "base_sha": "abc..." }
```

### 5.2 School / Scholar / View / Theme

School 的旧 edit 入口已经标记 deprecated。新代码优先使用
`/api/schools?discipline=<key>` 与 `/api/schools/:key?discipline=<key>`。

同模式（POST /api/new/<resource>、GET/PUT/DELETE /api/edit/<resource>/<key>）。

| 资源 | new POST | edit GET/PUT/DELETE |
|---|---|---|
| School | `/api/new/school` | `/api/edit/school/<key>` |
| Scholar | `/api/new/scholar` | `/api/edit/scholar/<key>` |
| View | `/api/new/view` | `/api/edit/view/<discipline>/<id>` |
| Theme | `/api/new/theme` | `/api/edit/theme/<discipline>/<key>` |

### 5.3 Discipline 标签库

#### PUT `/api/edit/discipline/<discipline>/tags`
全量替换该学科的标签库。

**Body**:
```json
{
  "tags": [
    { "key": "t_xxx", "label": { "zh": "...", "ja": "..." }, "color": "#34C759", "description": "..." }
  ],
  "base_sha": "abc..."
}
```

### 5.4 Reorder（拖动重排）

| Endpoint | 用途 |
|---|---|
| POST `/api/edit/reorder/discipline-schools` | 改某 discipline 下学派的排序 |
| POST `/api/edit/reorder/school-concepts` | 改某 school.concepts[] 的 KP 顺序 |
| POST `/api/edit/reorder/scholar-kps` | 改某 scholar.kpsOrder[] |
| POST `/api/edit/reorder/views` | 改 view chip 排序 |
| POST `/api/edit/reorder/themes-order` | 改 discipline.themes[] 顺序 |

**Body**: 因 endpoint 而异，参考各文件源码。

---

## 6. Read APIs

### 6.1 GET `/api/sync-status`
最近一次 D1 sync 时间戳。

**Response 200**:
```json
{
  "latest_ran_at": "2026-04-28T10:38:00.000Z",
  "latest_commit_sha": "abc123..."
}
```

无需认证。

### 6.2 GET `/api/search/<discipline>?q=<keyword>`
全文搜索。

**Query**:
- `q` 关键词（≥3 字符走 FTS5 + BM25 + snippet 高亮，<3 走 LIKE）

**Response 200**:
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

无需认证。

---

## 7. Agent 调用配方

### 7.1 安全新建 KP（防重复）

```
1. GET /api/search/<discipline>?q=<标题关键词>
   - 若 kps[] 有标题相似度高的，停下问 user
2. 用 _template.<format>.json 起手，写 v2/data/<disc>/kp/<id>.json
3. cd v2 && pnpm validate
4. git add ... && git commit && git push
5. (webhook 没配的话) curl POST /api/v1/sync/kp/<disc>/<id>
6. 把 success payload 的 public_url 给 user
```

### 7.2 移动 scholar 到另一个 school

```
1. 改 scholars/<scholar-key>.json 的 schools[]，schoolsExplicit 设 true
2. 可选改 schools/old.json 的 concepts[]、schools/new.json 的 concepts[]
3. validate + commit + push
4. webhook 自动同步全部受影响文件
```

### 7.3 删 KP

```
1. git rm v2/data/<disc>/kp/<id>.json
2. 顺手把所有 schools/*.json 里 concepts[] 含此 id 的也删了
3. 顺手把所有 scholars/*.json 里 kpsOrder[] 含此 id 的也删了
4. validate + commit + push
5. webhook 自动 delete D1（含 cascade kp_school / kp_scholar）
```

### 7.4 合并两个 KP

```
1. 决定合并方向（保留谁的 id）
2. 把另一个 KP 的内容并入保留的那个 KP 的 body
3. 把所有 schools/*.json 和 scholars/*.json 里被删 id 的引用替换 / 删除
4. git rm 被删的 KP 文件
5. validate + commit + push
6. 通过 webhook 自动同步全部
```

---

## 8. 路线图（未上线）

### v0.5.94 — v1 显式 CRUD endpoints
对外 GPT / 其他 AI 用，统一 RESTful 命名空间。每个 endpoint 内部双写 git + D1。

```
POST   /api/v1/kp                          create
GET    /api/v1/kp/<id>                     read
PUT    /api/v1/kp/<id>                     update
DELETE /api/v1/kp/<id>                     delete
GET    /api/v1/kp?discipline=&school=&q=   list/filter

# School / Scholar / View 同模式
```

### v0.5.95 — API token + RBAC + rate limit
- `Authorization: Bearer ms_v1_<32hex>` 取代 cookie session
- token 关联 user，复用 user_permission 表的 per-discipline 权限
- 每 token 100 req/min 写、500 req/min 读
- `/admin/tokens` UI 管理（生成 / 撤销）
- 默认过期 90 天

---

## 9. 真值参照

| 文档 | 用途 |
|---|---|
| [Main/CLAUDE.md](../Main/CLAUDE.md) | 项目核心规则、所有 session 启动必读 |
| [Main/CONTRIBUTING.md](../Main/CONTRIBUTING.md) | 设计哲学 + KP 三层架构 + 日文对照 + 部署规范 |
| [v2/LEARNING_KP_GUIDE.md](LEARNING_KP_GUIDE.md) | 7 步上传流程、5 种 format 详解、agent 反馈话术 |
| [v2/src/schemas/](src/schemas/) | KP / School / Scholar / View / Discipline / View zod schema 真源 |
| [v2/src/lib/body-parser.ts](src/lib/body-parser.ts) | 5 种 format 的 body string 解析逻辑 |
| [v2/src/lib/sync-resource.ts](src/lib/sync-resource.ts) | git→D1 sync helper（webhook 与 sync API 共用） |
| [v2/data/keiei/kp/_template.*.json](data/keiei/kp/) | 5 种 format 各 1 个 example，copy 起手 |
