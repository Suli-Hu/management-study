---
name: v2 admin 权限边界
description: v2 单 admin 模式 — husuli0623@gmail.com 可写，其他登录用户只读
type: project
scope: engineering-only
originSessionId: 86007380-fc99-4a71-ad77-ec4b6d5bc68a
---
v2 从 v0.2.8 (2026-04-24) 起区分 admin / 普通用户：

- **admin email**：`husuli0623@gmail.com`（wrangler.toml `[vars].ADMIN_EMAILS` 逗号分隔 CSV，可多人）
- **admin 能力**：编辑 / 删除 / 新建 KP（写权限），即 v0.3.5 web editor 的唯一授权对象
- **普通用户**：登录后只能读（含搜索 / 收藏 / 笔记）；不能碰 KP 内容

**Why:** 用户当前自己用 = 唯一 admin。未来可能卖出，到时加免费/付费分层（v0.3.x 的 Y 场景），但 v2 完整周期管理端口只对 admin 开放。

**How to apply:**

- 所有写路径（POST/PUT/DELETE 到 `/api/kp/*`、`/api/admin/*` 等）**必须** 首行 check `if (!locals.isAdmin) return new Response('Forbidden', { status: 403 })`
- UI 按钮（编辑 / 删除 / 新建）用 `{Astro.locals.isAdmin && (...)}` 包起来，非 admin 看不到
- `locals.isAdmin` 由 `middleware.ts` 调 `isAdmin(user, env.ADMIN_EMAILS)` 填充；直接读即可
- tests/auth.test.ts 有 `isAdmin` 5 个单测
- v0.3.5 web 编辑器实现时必读此文件
