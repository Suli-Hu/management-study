---
name: 多 Claude 会话分工
description: engineering（elegant-*）vs learning（epic-*）职责切分，谁改 data.js 需警觉对方
type: feedback
---

本项目同时有多个 Claude 会话，各司其职：

## Engineering 会话（`claude/elegant-*` 系列 worktree）

**职责：工程/基础设施，不碰 data**

- 模块化 / 代码结构优化（`js/*.js` 拆分、重构）
- 网页加载速度、性能优化（bundle size、lazy load、worker 缓存）
- UI 改版、视觉设计（CSS、卡片样式、布局）
- 登录密码机制、访问控制
- `CLAUDE.md` / `CONTRIBUTING.md` / `FORMAT.md` 等文档
- `.github/workflows/`、`wrangler.toml`、部署配置
- 审计脚本、数据完整性检查（不改数据，只验证）

**不做：**
- 不新增 / 修改 / 删除 KP 内容
- 不调整学派 / 学者数据
- data.js / data_ja.js 的内容变更

## Learning 会话（`claude/epic-*` 系列 worktree）

**职责：学习与内容，管 data**

- 新建 KP（按 CONTRIBUTING §8 原则）
- 修改 KP body、scholar、schools 归属
- 学派分类调整、合并、拆分
- 学者信息补全
- 按学派/学者推进经营学辅导（讲课）
- data.js / data_ja.js 的内容维护

**不做：**
- 不改 `js/*.js`（除非为了内容显示正确必须改）
- 不动 CSS、布局、登录机制
- 不改部署配置

## 例外 / 灰色地带

- **data 结构（非内容）变更** → engineering 管（比如新增 KP 字段）
- **渲染逻辑调整导致 data 微调** → 两边协商；优先 engineering 改 js，只有 data 端必需才动 data

## 跨会话冲突避免

两人都改 data.js **同一段**时会 git 冲突。规则：
- engineering 原则上不碰 data，天然避免
- 如果 engineering 必须碰 data（如字段 schema 变更）→ **先看 learning 是否在写**，或通过用户协调
- learning 不碰 js → 天然避免

## 对用户的意义

你在 engineering 会话里让我加 KP → 我应该**提醒你走错房间了**，建议去 learning 会话做。反之亦然。
