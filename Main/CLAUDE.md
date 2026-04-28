# 项目指令

## 设计哲学

三条不可违背的原则：

- **简洁优先** — 每个变更尽可能简单，影响最少的代码
- **根因导向** — 找到根因，拒绝临时修复，保持 Staff 级工程师标准
- **最小影响** — 只触及必要部分，不引入新问题

## 工作流: Plan → Execute → Verify → Learn

### Plan — 先规划，再动手

- 非平凡任务 (3+ 步骤或架构决策) **必须进入 Plan 模式**
- 拆为可验证的子任务，禁止一次性处理全部上下文
- 信息不足时先用工具检索补齐事实，再推理
- 优先编写详细规格说明以减少歧义
- 执行中出现偏差 — **立即停止重新规划**，不要硬推

### Execute — 委派优先，聚焦执行

**默认策略**: 能委派就委派，无依赖就并发，主 Agent 只做调度和结果聚合。

| 条件 | 调度方式 |
|------|----------|
| 子任务 ≥ 3 个 | **Agent Teams** — 并发协同 |
| 子任务 1-2 个，完全独立 | **Subagents** — 单次委派 |
| 简单搜索/定位 | 直接 Glob/Grep 或 Explore |

**Subagent 策略**:
- 大量使用 Subagents 保持主上下文窗口干净
- 每个 Subagent 只专注一个方向，聚焦执行
- 复杂问题通过多 Subagent 投入更多算力

### Verify — 完成前必须验证

- 永远不要在未证明有效的情况下标记任务完成
- 相关时，对比 main 分支与修改后的行为差异
- 自问: "一个 Staff 级工程师会批准这个吗？"
- 运行测试、检查日志、展示正确性
- 结论必须附带证据 (`file:line` / 命令输出 / 日志片段)

### Learn — 持续自我改进

- 收到用户纠正后，判断根因写入对应的 `rules/` 文件或 `CLAUDE.md`
- 为自己编写规则防止同类错误再次发生
- 持续迭代直到错误率显著下降

## 开始工作前

> **⚠️ V1（Main/data.js）已停用读写。线上是 v2/。learning agent 写新 KP 走 v2/data/keiei/kp/{id}.json + git commit + 调 sync API。**

每次修改数据/UI 之前，先读取 `CONTRIBUTING.md` §3 V2 数据流程 + §8 KP 生成 6 原则，特别是：
- KP 三层信息架构（导语→核心内容→评价标签）
- 日文版学术用语对照表（不能直接翻译中文）
- V2 数据流程（编辑 v2/data/.../*.json + pnpm validate + git commit + curl sync API）
- 学派 themeKey 必须 ∈ discipline.themes[].key（sync 时 fail-fast 校验）

**learning agent 写 KP 必读** ⭐ — `v2/LEARNING_KP_GUIDE.md`：
- 7 步上传流程（含 sync API 调用，让线上 ~3s 生效而非等 90s）
- 5 种 body format 的 example 文件（v2/data/keiei/kp/_template.{format}.json）
- evalContent 结构化字段写法
- 跨 discipline 推 KP 的复用方式（API 已通用）
- 失败时给用户的反馈话术

**任何 session 想用 API 管理知识库** 📘 — `v2/API_REFERENCE.md`：
- TL;DR：webhook 配好后 git push 自动 ~5-10s 同步 D1，多数场景 zero API call
- 所有 endpoint 完整说明（Sync API / Webhook / Edit / New / Read / Search）
- KP / School / Scholar / View 完整字段定义（zod schema 真源映射）
- 7 个常用 agent 调用配方（新建 / 移动 / 删除 / 合并 KP）
- v0.5.94+ 路线图（v1 CRUD + API token RBAC）

## 核心规则

1. **部署 = `git push origin main`**（不要再跑 `wrangler pages deploy`）
   - 2026-04-19 起配了 GitHub Actions（`.github/workflows/deploy.yml`），每次 push 到 main 自动部署 Cloudflare Pages
   - **默认：改完代码、自测通过 → 直接 push，不用问**
   - 仍要问的情况：破坏性改动、未充分验证、跨会话冲突风险
   - 查看部署状态：https://github.com/Suli-Hu/management-study/actions
2. **修改中文body后必须同步日文版**，日文版使用学术标准术语而非直译
3. **新建KP按三层架构**：导语(400)+strong加粗→核心内容→评价标签(义/限)
4. **语义标签用破折号**：`◆意义——xxx`，不能用冒号
5. **回复使用中文**

## 记忆文件

项目记忆存储在 `.claude-memory/` 目录下（git 追踪，跨机/跨 worktree 同步）。**新会话启动时必须执行**以下脚本把记忆复制到本 session 的 memory 目录：

```bash
# 新 worktree / 新电脑的会话启动时执行一次
SESSION_MEMORY="$HOME/.claude/projects/$(pwd | sed 's|/|-|g')/memory"
mkdir -p "$SESSION_MEMORY"
cp .claude-memory/*.md "$SESSION_MEMORY/"
```

记忆包含（完整清单见 `.claude-memory/MEMORY.md`）：
- **feedback_truth_first.md** 🔴 — 第一原则·真实性优先（元规则凌驾其他一切）
- **feedback_first_principles.md** 🔄 — 遇到 ≥2 次意外障碍时停下重估路径
- **feedback_preview_efficiency.md** ⚡ — 数据验证走 curl/grep、用户浏览器是最快 preview
- **feedback_no_auto_deploy.md** — git push = 部署，验证后直接 push
- **feedback_worktree_scope.md** — engineering/learning 会话分工
- **feedback_frontend_methodology.md** — 前端排查方法论
- **feedback_kp_generation.md** — KP 生成 6 原则
- **feedback_tutoring_workflow.md** — 经营学辅导工作流
- **user_sulihu.md** — 用户画像（备考志望校、协作偏好）
- **reference_study_materials.md** — 经营学备考教材位置
