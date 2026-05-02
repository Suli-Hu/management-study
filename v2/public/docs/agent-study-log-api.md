# Study Log API · 已合并

> ⚠️ **本文件已合并到统一的 API Reference**。此 URL 仅作 redirect 兜底，避免旧引用 404。
>
> 新位置：[https://study.sususu.org/docs/api-reference.md#8-study-log-api--学习日志](https://study.sususu.org/docs/api-reference.md#8-study-log-api--学习日志)

学习日志（`/api/study-sessions`）的完整文档现在收在统一 API Reference 的 §8。请直接读：

- 命名说明（`study-log` UI / `study-sessions` endpoint / `study_session` D1 表）→ §8.1
- `GET /api/study-sessions`（列表）→ §8.2
- `POST /api/study-sessions`（创建）→ §8.3
- `GET /api/study-sessions/{id}` → §8.4
- `PUT /api/study-sessions/{id}` → §8.5
- `DELETE /api/study-sessions/{id}` → §8.6
- 典型对话流程 → §8.7
- 速率 / 配额 → §8.8

认证方式（Bearer token、`/admin/tokens` 拿 token、scope 收窄）见 [§2 认证](https://study.sususu.org/docs/api-reference.md#2-认证)。

字段约束见 [§3.5 Study Session 字段](https://study.sususu.org/docs/api-reference.md#35-study-session-字段)。
