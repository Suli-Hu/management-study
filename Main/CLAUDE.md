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

每次修改 data.js / data_ja.js / index.html 之前，先读取 `CONTRIBUTING.md` 了解开发规范，特别是：
- KP三层信息架构（导语→核心内容→评价标签）
- 日文版学术用语对照表（不能直接翻译中文）
- 数据同步检查清单（三处同步、cnKey匹配）

## 核心规则

1. **部署 = `git push origin main`**（不要再跑 `wrangler pages deploy`）
   - 2026-04-19 起配了 GitHub Actions（`.github/workflows/deploy.yml`），每次 push 到 main 自动部署 Cloudflare Pages
   - **因此 `git push` 前必须征得用户同意**（push 即上线，等同部署）
   - 本地 `git commit` 随便做，不需要询问
   - 查看部署状态：https://github.com/Suli-Hu/management-study/actions
2. **修改中文body后必须同步日文版**，日文版使用学术标准术语而非直译
3. **新建KP按三层架构**：导语(400)+strong加粗→核心内容→评价标签(义/限)
4. **语义标签用破折号**：`◆意义——xxx`，不能用冒号
5. **回复使用中文**

## 记忆文件

项目记忆存储在 `.claude-memory/` 目录下，换电脑后请将这些文件复制到 `~/.claude/projects/` 对应目录的 `memory/` 下：

```bash
# 在新电脑上 clone 项目后执行（路径根据实际情况调整）
PROJECT_MEMORY="$HOME/.claude/projects/-Users-$(whoami)-*Web-Project/memory"
mkdir -p "$PROJECT_MEMORY"
cp .claude-memory/*.md "$PROJECT_MEMORY/"
```

记忆包含：
- **MEMORY.md** — 记忆索引
- **feedback_no_auto_deploy.md** — 部署前必须征求用户同意
- **feedback_frontend_methodology.md** — 前端排查方法论（全局扫描 + 真实尺寸测试 + Safari 坑清单）
- **feedback_kp_generation.md** — KP 生成工作流程原则
- **user_sulihu.md** — 用户画像（iPad Mini 用户，重视 UI 细节）
