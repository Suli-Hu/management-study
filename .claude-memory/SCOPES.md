---
name: Memory 文件作用域注册
description: 哪些 memory 文件归哪类 session — 防止 engineering 的技术决策污染 learning 的学科思路
type: reference
scope: shared
---

# Memory 作用域约定

两种 Claude 会话并行：
- **engineering**（`hardcore-*` worktree）：v2 架构 / D1 / auth / UI / 测试
- **learning**（`epic-*` worktree）：经营学 KP 生成 / 辅导 / 备考

文件之间应当**不混**。`.claude-memory/*.md` 开头的 frontmatter 里加 `scope:` 字段声明归属。

## `scope` 取值

| 值 | 含义 |
|---|---|
| `shared` | 两类 session 都需要（默认，无 `scope:` 字段也视为 shared） |
| `engineering-only` | 只 engineering 读；learning 启动脚本应 filter 掉 |
| `learning-only` | 只 learning 读；engineering 启动脚本应 filter 掉 |

## 当前文件归属（2026-04-24）

### shared（默认，两边都加载）
- `feedback_truth_first.md` — 元规则（真实性优先）
- `feedback_first_principles.md` — 根因导向
- `feedback_preview_efficiency.md` — preview 效率
- `feedback_no_auto_deploy.md` — git push = deploy（两边都 push）
- `feedback_worktree_scope.md` — engineering/learning 分工本身
- `feedback_kp_generation.md` — KP 写作 6 原则（learning 生成 engineering 也会看）
- `feedback_tutoring_workflow.md` — 辅导工作流（主要 learning，但 engineering 看也无害）
- `user_sulihu.md` — 用户画像
- `reference_study_materials.md` — 教材位置
- `SCOPES.md` — 本文件

### engineering-only
- `project_v2_d1_gotchas.md` — D1 SQL 坑
- `project_v2_admin_gate.md` — admin 权限模型
- `feedback_frontend_methodology.md` — 前端调试方法

### learning-only
（当前无。未来 learning 发现 engineering 看了反而混乱的笔记可以加）

## 未来加新 memory 文件的规矩

1. **默认不写 `scope:`** 即视为 shared —— 多数 memory 本来就是两边都有用
2. **只有显著技术细节**（SQL / 前端 bug / 构建流程）写 `scope: engineering-only`
3. **只有显著学科细节**（某学派的教学安排 / 单个学者的特殊 schema）写 `scope: learning-only`
4. 更新本文件把新 memory 登记到对应段落

## 启动脚本 filter 逻辑（参考实现）

两类 session 的 CLAUDE.md 里 memory 同步脚本应改为：

```bash
# engineering session（如 hardcore-* worktree）
for f in .claude-memory/*.md; do
  scope=$(grep -m1 '^scope:' "$f" | sed 's/^scope: *//' | tr -d '[:space:]')
  # engineering 跳过 learning-only
  [ "$scope" = "learning-only" ] && continue
  cp "$f" "$SESSION_MEMORY/"
done

# learning session（如 epic-* worktree）
for f in .claude-memory/*.md; do
  scope=$(grep -m1 '^scope:' "$f" | sed 's/^scope: *//' | tr -d '[:space:]')
  # learning 跳过 engineering-only
  [ "$scope" = "engineering-only" ] && continue
  cp "$f" "$SESSION_MEMORY/"
done
```

（上面脚本未改 worktree 里的 CLAUDE.md —— 避免 engineering 改 learning 的启动逻辑。
learning 下次 session 启动时看到本文件再决定是否用新 filter。）
