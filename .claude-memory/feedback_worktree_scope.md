---
name: 多 Claude 会话分工
description: engineering（elegant-*）vs learning（epic-*）职责切分，谁改 data.js 需警觉对方
type: feedback
originSessionId: 83912dfd-dab7-4ab8-81fc-2b38245f101f
---
本项目同时有多个 Claude 会话，各司其职：

## Engineering 会话（`claude/elegant-*` 系列 worktree）

**职责：工程/基础设施，不碰 data**

- 模块化 / 代码结构优化（`js/*.js` 拆分、重构）
- 网页加载速度、性能优化
- UI 改版、视觉设计
- 登录密码机制、访问控制
- 文档（CLAUDE.md / CONTRIBUTING.md / FORMAT.md）
- 部署配置（`.github/workflows/`、`wrangler.toml`）
- 审计脚本（不改数据，只验证）

**不做：不动 data.js / data_ja.js 的内容。**

## Learning 会话（`claude/epic-*` 系列 worktree）

**职责：学习与内容，管 data**

- 新建/修改/删除 KP（按 CONTRIBUTING §8）
- 学派分类调整、合并、拆分
- 学者信息补全
- 按学派/学者推进经营学辅导
- data.js / data_ja.js 内容维护

**不做：不改 js/*.js、CSS、部署配置。**

## 灰色地带

- **data 结构（非内容）变更** → engineering 管
- **渲染调整导致 data 微调** → 协商，优先 engineering 改 js

## 跨会话冲突避免

- engineering 天然不碰 data，data 冲突低概率
- engineering 必须动 data（schema 变更）时 → 先协调
- 用户让 engineering 做 learning 的活 → **提醒走错房间**
