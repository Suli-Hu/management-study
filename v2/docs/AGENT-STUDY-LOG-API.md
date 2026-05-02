# Study Log API · Agent 调用文档

> 给 learning agent 用：通过对话帮用户生成 / 编辑 / 删除学习日志。
> 复用现有 v2 API + Bearer token，**不需要服务端改动**。

---

## 1. 拿 Token

1. 用户在浏览器进 [`/admin/tokens`](https://study.sususu.org/admin/tokens)
2. 点「新建 Token」→ 填名字（如 `learning-agent`）+ 选 scope（推荐 `keiei` 单学科收窄）
3. 提交后页面**一次性**显示明文 `ms_v1_xxxxxxxx...`（38 字符），保存好
4. 把 token 字符串告诉 agent，存到 agent 的 secret store

**Token 安全**：D1 只存 SHA-256 hash，明文丢失只能撤销重建。Token 不写日志、不出现在 URL。

---

## 2. 认证方式

所有请求加 header：

```
Authorization: Bearer ms_v1_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
Content-Type: application/json
```

- middleware 自动从 D1 `api_token` 表查 user → set `locals.user`
- Bearer token 自动豁免 CSRF Origin check（无需带 cookie / Origin header）
- Token scope 收窄：若 token 只 scope `["keiei"]`，访问其他 discipline 会 403

---

## 3. Base URL

```
https://study.sususu.org
```

---

## 4. 主要 Endpoints

### 4.1 列出学习日志

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
{ "ok": true, "sessions": [
  { "id": "...", "discipline": "keiei", "kp_id": "k_001",
    "date": "2026-05-02", "start_time": "14:30",
    "duration_min": 30, "rating": 4, "note": "..." }
] }
```

### 4.2 创建一条

```
POST /api/study-sessions
```

Body（**所有字段约束严格** — 见 [study-session.ts](../src/schemas/study-session.ts)）：

| 字段 | 类型 | 必填 | 约束 |
|---|---|---|---|
| `discipline` | string | ✅ | 1-60 字符；必须是 D1 已存在的 discipline.key |
| `kp_id` | string | ✅ | 1-60 字符；KP 必须存在且属于 `discipline` |
| `date` | string | ✅ | YYYY-MM-DD |
| `start_time` | string | ✅ | HH:mm（24 小时制） |
| `duration_min` | int | ✅ | 1-600 |
| `rating` | int? | ❌ | 1-5 \| null（理解度自评） |
| `note` | string? | ❌ | 0-2000 字（心得 / 卡点） |

成功返回：
```json
{ "ok": true, "session": { "id": "...", ... } }
```

### 4.3 拿单条

```
GET /api/study-sessions/{id}
```

### 4.4 部分更新

```
PUT /api/study-sessions/{id}
```

Body：上述字段任意子集（**不允许改 `discipline`** —— 防 session 跨学科污染段位算法）。至少 1 个字段。

### 4.5 删除

```
DELETE /api/study-sessions/{id}
```

返回 `{ "ok": true, "id": "..." }` 或 `404`。**不可恢复**。

---

## 5. 辅助 Endpoints（写 session 前先查）

agent 创建 session 必须知道 `discipline` 和 `kp_id`。两种查法：

### 5.1 拿全部学派 + 学者 + KP 字典

```
GET /api/metadata?discipline=keiei
```

返回学派列表 + 该 discipline 全部 KP。一次拉完 cache 在 agent 端，后续 user 说"今天学了 X 知识点"时本地匹配。

### 5.2 关键词搜 KP

```
GET /api/kps?q=认知失调&school=ob
```

| query | 说明 |
|---|---|
| `q` | KP title 模糊搜（中文 OK） |
| `school` | 学派 key 收窄 |
| `scholar` | 学者 key 收窄 |
| `limit` / `offset` | 分页（默认 50） |

---

## 6. 错误响应格式

所有错误统一格式：
```json
{ "ok": false, "reason": "<machine-readable>", "detail": "..." }
```

| HTTP | reason | 说明 |
|---|---|---|
| 400 | `bad_request` | 请求格式错（如 invalid JSON） |
| 400 | `invalid_input` | Zod 校验失败，`detail` 是 path: message 数组 |
| 400 | `kp_discipline_mismatch` | KP 不属于指定 discipline |
| 401 | `not_authenticated` | Token 无效 / 缺失 / 撤销 / 过期 |
| 403 | — | Token scope 不允许此 discipline |
| 404 | `not_found` | session id 不存在或非该 user 拥有 |
| 404 | `kp_not_found` | KP id 不存在 |

---

## 7. 典型对话流程

**用户**：「我今天上午 9 点学了认知失调理论 30 分钟，理解度 4 星」

**Agent 内部**：
1. （可选缓存）`GET /api/metadata?discipline=keiei` 拿 KP 字典
2. 模糊匹配「认知失调理论」→ 找到 `kp_id="k_xxx"`，归属 `school="ob"`
3. POST：
   ```bash
   curl -X POST https://study.sususu.org/api/study-sessions \
     -H "Authorization: Bearer ms_v1_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" \
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
4. 收到 `{ ok: true, session: { id, ... } }` → 回用户「✓ 已记录，今天累计 X 分钟」

---

## 8. 速率 / 配额

目前**无显式限速**。Cloudflare Workers 默认 50ms CPU / 请求；D1 写入约 5-20ms。

若 agent 一次对话要写 5+ 条 session，请**串行调用**（每次 await 完成再下一次），避免 D1 写冲突或 CF 短时 burst。

---

## 9. 升级 / 变更通知

API schema 改动会反映在：
- [study-session.ts](../src/schemas/study-session.ts) — Zod schema 单一来源
- [migration 0016_study_session.sql](../migrations/0016_study_session.sql) — D1 表 CHECK 约束

调用方建议先做一次 dry-run（POST 少量数据）确认 schema 没漂移，再批量调用。

---

— v0.7.x · 文档跟随当前 main 分支同步
