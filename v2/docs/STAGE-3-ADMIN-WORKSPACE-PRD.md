# Stage 3 PRD: Admin Console and Discipline Owner Workspace

状态：Draft v1  
负责人：Product / Engineering  
适用版本：Phase 1/2 API-first multi-tenant 已上线后  
最后更新：2026-05-02

## 1. 背景

Phase 1/2 已经把核心内容写入链路迁到数据库：

- Database 是知识内容的 source of truth。
- `tenant = discipline` 是数据隔离边界。
- KP / school / scholar / view 已有 API-first 写入接口。
- API token 可以让外部 agent 直接调用 API。
- Stage 2.5 已补上 PR CI、middleware 测试和线上 Bearer token CRUD 冒烟。

但是当前后台仍然是“功能拼出来了”，还没有形成完整产品流程：

- `/admin/users` 可以配权限，但角色语言仍是旧的 `admin/guest`，和新模型 `owner/editor/viewer` 没完全统一。
- `/admin/tokens` 可以生成 token，但缺少面向“学科负责人”的操作指引、风险提示和 token 生命周期治理。
- `/admin/disciplines` 已有学科管理，但创建/编辑/删除仍写 GitHub JSON，这是 Phase 1/2 方向里的遗留点。
- 超级管理员和学科负责人没有清晰分工：哪些事只能超级管理员做，哪些事负责人自己能完成，需要产品化。

Stage 3 的目标不是继续零散加接口，而是把“创建学科 -> 授权负责人 -> 发 token -> 通过 API 维护知识 -> 审计与回收”做成一条可靠的运营闭环。

## 2. 产品目标

### 2.1 核心目标

1. 超级管理员能在 5 分钟内完成一个新学科的上线准备。
2. 学科负责人拿到权限和 token 后，可以不接触 Git，通过 API 或后台维护本学科内容。
3. 所有内容访问都基于 tenant 隔离，任何用户或 token 都不能越权读取/写入别的学科。
4. 权限、token、内容写入有清晰可查的状态和审计记录。
5. API 使用流程对非工程用户足够清楚：能复制示例、知道先调什么、错了看哪里。

### 2.2 非目标

本阶段不做：

- 计费、订阅、套餐。
- 学生端学习体验重构。
- AI 自动生成 KP 的产品闭环。
- 大规模批量导入器。
- 完整低代码 CMS。
- 前端视觉最终稿实现。需要先完成本 PRD，再单独做 demo / prototype。

## 3. 用户与角色

### 3.0 Tenant 与 User 的产品关系

产品定义：

- `tenant` 是一个学科空间，例如 `keiei`、`marketing`。
- `user` 是一个登录账号，例如某个邮箱。
- 一个 user 可以同时属于多个 tenant。
- 一个 tenant 可以有多个 user。
- token 绑定 user，再通过 scope 收窄到一个或多个 tenant。

因此，“用户不是 tenant”。用户是人，tenant 是这个人被授权进入的学科工作空间。未来计费如果要做，也应优先挂在 tenant 上，因为一个学科可能有多个负责人和编辑者。

### 3.1 用户类型

| 用户 | 说明 | 典型任务 |
|---|---|---|
| Super Admin | 平台最高权限，通常是项目 owner | 建学科、分配负责人、生成/撤销 token、看全局审计 |
| Discipline Owner | 某个学科负责人 | 管理本学科成员、内容、token、API 使用 |
| Editor | 学科编辑者 | 创建/修改/删除本学科内容 |
| Viewer | 只读协作者 | 查看本学科内容和元数据 |
| Agent / API Client | GPT、Claude、脚本等外部调用方 | 使用 Bearer token 调 API 写入或读取内容 |

### 3.2 角色权限矩阵

| 能力 | Super Admin | Owner | Editor | Viewer |
|---|---:|---:|---:|---:|
| 创建/删除学科 | 是 | 否 | 否 | 否 |
| 修改学科基础信息 | 是 | 本学科 | 否 | 否 |
| 管理本学科成员 | 是 | 是 | 否 | 否 |
| 创建 API token | 是 | 本学科范围内 | 可选，默认否 | 否 |
| 撤销 API token | 是 | 本学科范围内 | 自己的 token，可选 | 否 |
| 读本学科内容 | 是 | 是 | 是 | 是 |
| 写本学科内容 | 是 | 是 | 是 | 否 |
| 查看审计日志 | 全局 | 本学科 | 可选，只看自己 | 否 |

产品决策：

- 对用户展示统一使用 `Owner / Editor / Viewer`。
- 旧表 `user_permission.role = admin/guest` 继续作为迁移兼容层，但 UI 不再把 `admin/guest` 作为产品语言。
- `tenant_member.role` 是新权限模型的主语义。

## 4. 当前能力盘点

### 4.1 已有页面

| 页面 | 当前能力 | 主要缺口 |
|---|---|---|
| `/admin/users` | 用户 × 学科权限矩阵；即时更新权限 | 角色语言旧；只能对已有 user 操作；缺少 owner 概念；缺少变更审计 |
| `/admin/tokens` | super-admin 创建/撤销 token；scope 不超过用户权限；一次性展示明文 | 缺少 owner 自助；缺少“复制 API 快速开始”；缺少 token 风险状态和使用诊断 |
| `/admin/disciplines` | 创建/编辑/删除学科元数据；展示 view/school/scholar/KP counts | 仍写 GitHub JSON；没有学科详情页；没有 owner/health/API 状态 |

### 4.2 已有 API

| API | 状态 |
|---|---|
| `GET /api/me` | 可用于 token 自检 |
| `GET /api/metadata?discipline=<key>` | 可获取写入前元数据 |
| `GET/POST /api/kps` | 已 API-first |
| `GET/PATCH/DELETE /api/kps/:id` | 已 API-first |
| `GET/POST/PATCH/DELETE /api/schools` | 已 API-first |
| `GET/POST/PATCH/DELETE /api/scholars` | 已 API-first |
| `GET/POST/PATCH/DELETE /api/views` | 已 API-first |
| `/api/admin/*` | 可用，但仍偏 super-admin 内部工具 |

## 5. 信息架构

### 5.1 Super Admin Console

建议新增 `/admin` 作为后台首页，而不是让用户记住多个入口。

模块：

1. Overview
   - 学科数量
   - 活跃负责人数量
   - 近 7 天 API 写入次数
   - 即将过期 token 数
   - 最近失败 API 调用

2. Disciplines
   - 学科列表
   - 每个学科展示内容数量、负责人、token 数、最近更新
   - 创建/编辑/归档学科
   - 进入学科详情

3. Members
   - 按学科管理成员
   - 按邮箱添加成员
   - 设置 Owner / Editor / Viewer
   - 移除权限

4. Tokens
   - 全局 token 列表
   - 按学科、用户、状态筛选
   - 创建、撤销、查看 last used
   - 复制 token 使用说明

5. Audit
   - 角色变更
   - token 创建/撤销
   - API 写入内容
   - 失败的越权尝试

6. Docs
   - Agent 快速开始
   - API 示例
   - 常见错误码
   - 当前 token 自检说明

### 5.2 Discipline Owner Workspace

建议入口：`/:discipline/workspace`。

理由：现有学习端已经以 `/:discipline/...` 组织页面，工作台放在同一学科路径下更容易理解；服务端仍必须按当前登录用户权限判断能否进入，不能因为 URL 里有 discipline 就信任它。

模块：

1. Dashboard
   - 本学科 KP / school / scholar / view 数量
   - 最近更新
   - API token 状态
   - 快速复制 API 调用流程

2. Content
   - KP 列表、搜索、筛选、编辑入口
   - School 列表
   - Scholar 列表
   - View 管理

3. Members
   - Owner 可管理本学科 Editor / Viewer
   - Editor / Viewer 只读或不可见

4. API Tokens
   - Owner 可创建本学科范围 token
   - token 默认 scope 固定为当前 discipline
   - 一次性明文展示
   - 可撤销

5. API Guide
   - 该学科专属 quickstart
   - 自动带入 `discipline=<key>`
   - 示例覆盖 `/api/me`、`/api/metadata`、`POST /api/kps`

## 6. 核心流程

### 6.1 新学科上线

参与者：Super Admin

1. 打开 `/admin`。
2. 进入 Disciplines，点击创建学科。
3. 输入学科 key、中文名、英文名、日文名、说明。
4. 系统只写 D1：
   - `discipline`
   - `tenant`
   - 必要默认配置
5. 创建后进入学科详情页。
6. 添加学科负责人邮箱，设置为 Owner。
7. 为负责人创建 token，scope 默认为该学科。
8. 系统展示 quickstart：
   - `/api/me`
   - `/api/metadata?discipline=<key>`
   - `POST /api/kps?discipline=<key>`
9. Super Admin 把 token 和使用说明交给负责人。

验收：

- 创建学科后无需 GitHub commit，线上立即可见。
- 负责人 token 只能读写该学科。
- 未授权学科返回 `403 not_viewer/not_editor`。

### 6.2 给已有用户授权

参与者：Super Admin 或 Owner

1. 输入邮箱。
2. 如果用户已存在，直接授予角色。
3. 如果用户不存在，创建 pending invite。
4. 用户首次登录后，系统自动把 pending invite 绑定到真实 user。
5. 权限变更写入：
   - `tenant_member`
   - 迁移期同步写 `user_permission`
   - `audit_log`

验收：

- 不要求用户必须先登录过才能被配置权限。
- super-admin 权限仍由 `ADMIN_EMAILS` 控制，不在 UI 中修改。
- 降权后，该用户已有 token 立即失去超出权限的能力。

### 6.3 创建 API token

参与者：Super Admin / Owner

1. 选择用户。
2. 选择 token 类型：
   - Human-owned token：绑定某个用户。
   - Agent token：仍绑定用户，但名称和说明标记用途。
3. 选择学科 scope。
4. 选择过期时间。
5. 生成 token。
6. 一次性展示明文。
7. 展示下一步使用说明。

规则：

- token 不能超过用户本身权限。
- Owner 创建 token 时，scope 固定在自己所属 tenant 内。
- token 明文只展示一次。
- token 创建、复制确认、撤销都写审计。

验收：

- 使用 token 调 `/api/me` 能看到身份、scope、可读/可写学科。
- token 过期或撤销后，写入接口不可用。
- 删除成员权限后，旧 token 不再能访问该 tenant。

### 6.4 外部 agent 写入知识

参与者：Discipline Owner / Agent

推荐流程：

1. `GET /api/me`
2. `GET /api/metadata?discipline=<key>`
3. 如果需要，先创建或更新：
   - school
   - scholar
   - view
4. `POST /api/kps?discipline=<key>`
5. `GET /api/kps/:id` 确认结果。
6. 必要时 `GET /api/kps/:id/versions` 查看版本。

验收：

- API 不需要 GitHub。
- 客户端 body 不能传入并伪造 `tenant_id`。
- 服务端强制注入 `tenant_id`、`created_by`、`updated_by`。
- 引用的 school/scholar/view 必须属于同一 tenant。

### 6.5 撤销和离职

参与者：Super Admin / Owner

1. 找到成员或 token。
2. 撤销 token。
3. 移除成员权限。
4. 系统记录审计。
5. 旧 token 调 API：
   - 被撤销：`401`
   - 用户已无 tenant 权限：`403`

验收：

- 权限回收立即生效。
- 可查看是谁、何时、为什么撤销。

## 7. 功能需求

### P0: 必须做

1. 后台首页 `/admin`
   - 聚合现有 users / tokens / disciplines 入口。
   - 显示关键状态：学科、成员、token、最近 API 写入。

2. 学科管理 API-first 化
   - `/admin/disciplines` 创建/编辑/删除只写 D1。
   - 不再通过 GitHub Contents API 写 `v2/data/<discipline>/discipline.json`。
   - 旧 GitHub JSON 路径标记 deprecated。

3. 角色语言统一
   - UI 展示 Owner / Editor / Viewer。
   - 后端继续兼容 `user_permission admin/guest`。
   - 新写入以 `tenant_member` 为主。

4. 按邮箱授权
   - 支持给未登录邮箱预授权。
   - 用户首次登录后自动绑定。
   - pending 状态可取消。

5. Token 创建流程重构
   - 创建后展示 API quickstart。
   - token scope 用产品语言解释。
   - 支持按学科筛选 token。
   - 支持撤销原因。

6. 审计日志
   - 记录 role grant/revoke。
   - 记录 token create/revoke。
   - 记录 API content write/delete。
   - 记录越权失败事件，至少保留最近 N 条。

7. 文档更新
   - `API_REFERENCE.md` 拆分或重写首页结构。
   - 明确“新流程不走 Git”。
   - 旧 sync/webhook 文档移到 legacy 区。

### P1: 应该做

1. Discipline Owner Workspace
   - 本学科 dashboard。
   - 本学科 token 管理。
   - 本学科 API guide。

2. Owner 管理本学科成员
   - Owner 可添加 Editor / Viewer。
   - Owner 不可添加 Super Admin。
   - Owner 不可操作其他学科。

3. API 使用诊断
   - token last used、last error。
   - 常见错误解释：`not_editor`、`tenant_not_found`、`scope_exceeds_user_permission`。

4. Token 健康状态
   - Active
   - Expiring soon
   - Expired
   - Revoked
   - No effective permission

5. 学科详情页
   - counts
   - members
   - tokens
   - recent writes
   - health checklist

### P2: 可延后

1. 批量导入 KP。
2. 可视化 API request builder。
3. Owner 自助创建新学科申请。
4. Slack/email 通知。
5. 细粒度 token 权限，例如只允许 KP 写入、不允许删除。
6. 内容发布审核流：draft / review / published。

## 8. 数据与后端需求

### 8.1 表结构建议

已有：

- `tenant`
- `tenant_member`
- `api_token`
- `knowledge_point_versions`
- `user_permission` legacy

建议新增：

```sql
CREATE TABLE pending_tenant_invite (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner', 'editor', 'viewer')),
  invited_by TEXT REFERENCES user(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  accepted_at TEXT,
  canceled_at TEXT,
  UNIQUE (tenant_id, email)
);

CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT,
  actor_user_id TEXT,
  actor_email TEXT,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
```

### 8.2 权限规则

- Super Admin 由 `ADMIN_EMAILS` 决定。
- 非 Super Admin 的所有读写都必须落到具体 tenant。
- Owner / Editor 可写。
- Viewer 只读。
- token 只做权限收窄，不做权限放大。
- 移除用户 tenant 权限后，绑定该用户的 token 立即失去该 tenant 访问能力。

### 8.3 API 迁移要求

- 新 admin API 不接受客户端传入 `tenant_id` 作为信任来源。
- 创建 discipline 时，服务端同时创建 tenant。
- 删除 discipline 必须满足内容为空。
- 删除 discipline 应软删除或归档优先，硬删除保留给 P1/P2。

## 9. 页面需求

### 9.1 `/admin`

目的：让 Super Admin 一眼知道系统是否健康，并快速进入关键任务。

必须展示：

- 学科总数
- 用户总数
- active token 数
- expiring token 数
- 最近 10 条审计
- 快捷入口：
  - 新建学科
  - 添加负责人
  - 创建 token
  - 打开 API 文档

### 9.2 `/admin/disciplines`

保留当前列表思路，但升级为：

- 点击行进入学科详情。
- 每行显示 owner、内容数量、token 数、最近更新时间。
- 创建/编辑只写 D1。
- 删除改为 Archive 优先。

### 9.3 `/admin/tenants/:tenantId`

学科详情页。

Tabs：

- Overview
- Members
- Tokens
- API Guide
- Audit

### 9.4 `/admin/users`

从“用户权限矩阵”升级为“成员管理”。

保留矩阵视图作为高级模式，但默认视图应按学科分组：

- 选择学科
- 查看成员列表
- 添加邮箱
- 设置 Owner / Editor / Viewer
- 查看 pending invite

### 9.5 `/admin/tokens`

升级点：

- 过滤：学科、用户、状态。
- 创建时显示“有效权限预览”。
- 创建成功后显示 quickstart。
- token 状态清晰：
  - Active
  - Expiring soon
  - Expired
  - Revoked
  - No effective permission

### 9.6 `/:discipline/workspace`

Owner / Editor / Viewer 的学科工作台。

P1 做，P0 可先用 admin 入口承接。

## 10. 测试与验收

### 10.1 自动化测试

P0 必须覆盖：

1. Super Admin 创建 discipline 只写 D1，不调用 GitHub。
2. 创建 discipline 后自动创建 tenant。
3. 给已有用户授予 Owner / Editor / Viewer。
4. 给未登录邮箱创建 pending invite。
5. 用户首次登录后 pending invite 自动绑定。
6. token scope 不可超过用户权限。
7. 移除权限后旧 token 失效。
8. Owner 不能操作其他 tenant。
9. Viewer 写入返回 403。
10. Bearer token 无 Origin 的 `POST/PATCH/DELETE` 继续可用。
11. Cookie 写请求无 Origin 继续 403。
12. 审计日志写入成功。

### 10.2 线上冒烟

每次上线后跑：

1. `/api/me`
2. 创建测试 discipline。
3. 给测试邮箱授权。
4. 生成测试 token。
5. 用 token 创建 school / scholar / view / KP。
6. 用另一个学科 token 访问应 403。
7. 撤销 token 后访问应失败。
8. 清理测试数据。

### 10.3 人工验收

Super Admin 能完成：

- 3 分钟内建一个空学科。
- 2 分钟内给负责人发 token。
- 能解释 token 能访问哪些学科。
- 能撤销 token 并确认立即生效。

Discipline Owner 能完成：

- 不看 GitHub，只根据后台 API guide 调通 `/api/me`。
- 创建一个测试 KP。
- 看懂常见错误提示。

## 11. 风险与对策

| 风险 | 影响 | 对策 |
|---|---|---|
| 旧 GitHub JSON 文档和新 API-first 文档混在一起 | 用户误走旧流程 | API 文档重排，新流程置顶，legacy 折叠 |
| `admin/guest` 与 `owner/editor/viewer` 双模型混乱 | 权限理解错误 | UI 只显示新角色，后端兼容旧表 |
| Owner 自助 token 权限过大 | 越权风险 | token scope 固定 tenant，服务端二次校验 |
| pending invite 预授权被错误邮箱领取 | 安全风险 | 邮箱登录验证后按 normalized email 绑定 |
| 删除学科误删内容 | 数据风险 | P0 使用 archive/disable，硬删除只允许空学科 |
| 审计日志增长过快 | 存储风险 | P0 保留核心事件，P1 增加分页和清理策略 |

## 12. Demo / Prototype 计划

PRD 确认后再做前端 demo，不在本 PRD commit 中实现。

建议 demo 顺序：

1. Super Admin Console 首页。
2. 学科详情页：Overview / Members / Tokens / API Guide。
3. Token 创建成功后的 quickstart overlay。
4. Discipline Owner Workspace 首页。

Demo 要求：

- 使用现有 v2 视觉语言，不做营销式 landing page。
- 以管理工具效率为主，信息密度高但不拥挤。
- 移动端只保证可用；主要体验面向桌面/iPad。
- 设计 demo 时使用 frontend design / UX skills。

## 13. 推荐实施顺序

### Stage 3A: 产品与设计收口

- 完成本 PRD。
- 画 demo HTML / prototype。
- 确认信息架构和角色语言。

### Stage 3B: 后端模型收口

- discipline admin API-first 化。
- pending invite。
- audit_log。
- role mapping helper。

### Stage 3C: Super Admin Console

- `/admin` 首页。
- 学科详情。
- 成员管理。
- token 管理重构。

### Stage 3D: Owner Workspace

- `/:discipline/workspace`。
- Owner token 自助。
- API guide。

### Stage 3E: 测试与上线

- 自动化测试补齐。
- 线上 smoke 脚本。
- 文档更新。
- 人工验收。

## 14. 决策摘要

- Stage 3 的核心不是新资源 API，而是运营后台产品化。
- GitHub 继续只作为代码仓库，不作为新业务数据写入路径。
- Super Admin 管全局，Owner 管单学科。
- token 是用户权限的收窄，不是独立超权身份。
- PRD 先行，demo 其次，最后进入开发。
