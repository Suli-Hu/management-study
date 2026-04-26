---
name: v2 产品定位 + 用户模型 + 4 层数据架构
description: Anytime Study 是多学科知识记录平台。4 层数据：学派组 → 学派 → 学者 → 知识点。用户分 super-admin / 学科 admin / 学科 guest / 灰锁 / 邀请码 invite-guest。CRUD + 拖排 + RBAC 都已实装。
type: project
---

## 是什么
**Anytime Study** — 多学科知识记录平台。给学科编写者沉淀知识，给学习者按章节浏览。

线上：`management-study-v2.pages.dev`（仍未 cutover；v1 在 `management-study.pages.dev`）。

## 4 层数据架构（每层支持增删改查）

```
学派组（theme）        例：个体的世界 / 古典组织论 / 院校学派
  └─ 学派（school）     例：行为主义学派 / 哈佛学派
      └─ 学者（scholar）  例：马斯洛 / 库尔特·勒温
          └─ 知识点（KP） 例：需求层次理论 / 三阶段变革模型
```

存储：`v2/data/<discipline>/{discipline.json[themes],schools/X.json,scholars/X.json,kp/X.json}` JSON 源 → GitHub commit → GitHub Actions sync → D1 缓存 → 页面 SSR。

每层有专属编辑器和必填/可选字段；细节 schema 在 `v2/src/schemas/*.ts`。

**拖排能力**（drag-reorder-client 引擎）：
- 学派组（themes）顺序拖排：`/[discipline]` 页 ≡ handle 长按
- 学派跨组拖动：从主题 A 拖到主题 B（自动同步 school.themeKey via Tree API 原子 commit）
- 学派同组内重排
- KP 在学派内重排（split-pane 左栏 li）

## 用户模型（per-discipline RBAC，v0.4.25 + v0.4.33）

| 角色 | 命中条件 | 权限范围 |
|---|---|---|
| super-admin | `user.email ∈ env.ADMIN_EMAILS`（CSV）| 全学科 god mode（read+write） |
| 学科 admin | `user_permission(user_id, discipline_key, role='admin')` | 该学科 CRUD 全 |
| 学科 guest | `user_permission(user_id, discipline_key, role='guest')` | 该学科只读 |
| 灰锁 | 无 user_permission 行 | 学科卡片 🔒 不能进 |
| invite-guest | `user.email === env.INVITE_GUEST_EMAIL` | 全学科只读，共用一个 user_id |

> 同一邮箱在不同学科可以是任意组合。例：经营学 admin + 金融 guest + marketing 灰锁。

实现：`src/middleware.ts` load `locals.permissions: Map<discipline, role>`，提供 helper `canEdit(d) / canRead(d) / isSuperAdmin / isInviteGuest`。所有写路径 admin gate 推迟到拿到 discipline 之后再 `canEdit(d)` 判定。

## 登录方式

两条路径（`/login`）：

1. **邀请码** tab（默认）：唯一码 `123`（env.INVITE_CODE_GUEST）→ 全学科 guest，共用 user
2. **邮箱验证码** tab：邮箱 magic-link + 6 位 code 双轨；首次登录自动建 user（按 user_permission 表权限）

加白工作流：super-admin（husuli0623@gmail.com）跟 AI 对话："给 alice@x.com 经营 admin"→ AI 跑 `wrangler d1 execute --remote --command "INSERT INTO user_permission..."`。

## 何时引用本记忆

- 新会话讨论"权限"、"用户"、"加白"、"灰锁"、"邀请码"、"super-admin"
- 用户提"邀请新人"时
- 讨论 4 层架构（学派组 / 学派 / 学者 / 知识点）的字段、关联、CRUD 行为
- 评估"是否要加新功能涉及权限"
- 任何涉及 multi-discipline 行为
