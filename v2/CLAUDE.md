# v2 — Engineering Agent 工作守则

## 🚧 第一条铁律：code/data 严格分离 (v0.8.27 起)

**git 只管 code，D1 只管 data，两边永不串。**

- ✅ Engineering 该做的：改 `v2/src/` `v2/public/` `v2/migrations/` `v2/scripts/` `v2/tests/` `v2/docs/` 等代码与配置 → push GitHub → CI 部署
- ❌ Engineering **绝对不要做的**：编辑 `v2/data/**/*.json` push 到 git
  - 不论是修 bug、补缺数据、批量改 format、还是"顺手清个 orphan"，**都不行**
  - learning agents 通过 admin API 直接写 D1；git push 触发 deploy 后再也不会跑 sync 覆盖 D1，所以 git 里的 v2/data/ 已经是 stale snapshot
  - 你 push v2/data/ 改动 ≠ 改 D1，纯属在 git 制造 drift；要修 data 走 admin API

### 怎么修数据问题
1. **手工**: 在浏览器里登 admin 编辑（最省事）
2. **批量 / 脚本**: `POST /api/kps`, `PATCH /api/kps/:id`, `PATCH /api/kps/batch` 走 Bearer token；token 在 `~/.claude/projects/.../secrets/ms-automation-token.txt`
3. **schema migration**: `v2/migrations/00XX_*.sql` 是允许 push 的（schema 不是 content），CI workflow 仍跑 `d1 migrations apply`

### 数据恢复路径
**Cloudflare D1 Time Travel** — 默认 30 天 PITR：
- Dashboard → D1 → management-study-v2 → Time Travel → 选时间点恢复
- 不再依赖 `pnpm sync:d1` 重灌 git seed（脚本仍保留作冷启动 fallback，但不应再用）

### Why this rule exists
v0.8.20-v0.8.26 期间发现：每次 engineering push 触发 deploy 都跑 `sync:d1`，用 git 的 v2/data 文件 wipe+reload D1。learning agents 无 git 权限，写入只到 D1；如果 git writeback 静默失败，下一次 engineering push 就把 D1 的新工作覆盖回 git 旧状态。审计 marketing 学科未发现实质丢失（KP.schools 字段救场让 kp_school 可重建），但架构隐患极高。v0.8.27 deploy-v2.yml 去掉 sync 步骤彻底脱钩。

### v0.11.3 补完整：webhook + reconcile 一并删除
v0.8.27 漏网了 `/api/v1/webhook/github` —— GitHub push 仍然触发 webhook，webhook 跑 syncResource 用 git data 覆盖 D1。这条反向覆盖路径在 v0.11.1 暴露：用户改学派 tag 写 D1 成功，紧接着拖拽 KP 顺序 commit git，webhook fire 把 git stale tags 写回 D1。v0.11.3 删除 webhook handler + reconcile.yml workflow（reconcile 是 webhook 的"保险栓"，webhook 没了它失业）。手动恢复路径仍保留：`POST /api/v1/sync-discipline/<discipline>` + `pnpm sync:d1` + D1 Time Travel。

---

## 多 agent 分工总览

| Agent 类型 | worktree | 权限 | 主要碰的目录 |
|---|---|---|---|
| **engineering** (我) | `magical-*` / `claude-*` | git push + admin API | `v2/src`, `v2/public`, `v2/migrations`, `v2/scripts`, `v2/tests`, `v2/docs`, `.github/`, `Main/` (V1 archived) |
| **learning** (epic-*) | `epic-*` | admin API only | (none in git) — 通过 admin API 直接写 D1 |

跨 worktree 协作约定：
- engineering 提供 admin API + UI + schema migration + 工具 (sync 脚本) — **代码** 是产出
- learning 通过 admin API 编辑 KP / scholar / school — **数据** 是产出，永远在 D1 不在 git

如果 engineering session 改完代码顺手发现"哎 m088 内容好像有问题"，**不要在 git 里直接改 .json**，要么:
1. 把它当成 task 列出来，让用户 / learning agent 去 admin UI 修
2. 写一个 admin API 调用脚本帮用户跑一次（推荐 dry-run + 二次确认）

---

## 其它常用规则

详见 `~/.claude/projects/-Users-husuli-Documents-Web-Project/memory/MEMORY.md` 的 engineering-only 条目。
