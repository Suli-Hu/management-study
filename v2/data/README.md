# 数据目录

## ⚠️ v0.8.27 起重要策略变更（2026-05-05）

**`v2/data/` 不再是 D1 的真值源。git 与 D1 严格分离。**

- **代码** → engineering 通过 GitHub PR 改 → CI 自动部署
- **数据** (KP / scholar / school 内容 + 关联) → 通过 admin UI / API 直接写 D1，**永不再 push 到 git**

`.github/workflows/deploy-v2.yml` 已去掉 `Generate D1 sync SQL` + `Apply D1 sync shards` 步骤；engineering push 不再覆盖 D1。

### 这个目录现在的角色
- **冷启动 / 灾难恢复 seed** — 当 D1 完全丢失需重建时，`pnpm sync:d1` + `pnpm sync:d1:apply:remote` 仍可手动跑（脚本保留），但 CI 不再自动调
- **历史归档** — 之前 sync 过的数据快照，可能与 D1 现状有 drift（admin API 写入未 writeback）

### Why this changed
之前 sync 是 "git → D1 wipe-reload"，假设 git 是真值源。但实际 learning agents 没 git 权限，只能走 admin API 写 D1，git writeback 路径偶尔 silent failure。结果 engineering 每次 push 触发 sync 都可能覆盖 learning agents 的工作 — 静默数据丢失。

### 数据恢复路径
不再依赖 git seed。走 **Cloudflare D1 Time Travel** (默认 30 天 PITR)：
- Dashboard → D1 → management-study-v2 → Time Travel → 选时间点 → 恢复

---

## 目录结构

```
data/
  <discipline>/                    # 学科（keiei / marketing / ...）
    discipline.json                # 学科元信息 + 主题分组
    schools/
      <schoolKey>.json             # 一个学派一个文件
    scholars/
      <scholarKey>.json            # 一个学者一个文件
    kp/
      <kpId>.json                  # 一个 KP 一个文件
```

## 命名规则

| 类型 | id 格式 | 例子 |
|---|---|---|
| 学科 key | `discipline.json` 里的 `key` 字段 + 目录名（必须一致） | `keiei`, `marketing` |
| 学派 key | 小写蛇形 | `change`, `org_learning` |
| 学者 key | 小写蛇形 | `tushman`, `march` |
| KP id | 小写字母前缀 + 数字 | `k562`, `m1`（未来 marketing 用 m 开头） |

## 修改 / 新增 KP 工作流（learning Claude）

**v0.8.27 起：通过 admin UI / API 改 D1，不要再编辑 v2/data/ 文件 push git。**

老流程（已废弃）：
```bash
# ⚠️ 已废弃 — 不要这么干
vim v2/data/keiei/kp/k562.json && git push
```

新流程：
- **改已有 KP**: 在浏览器里登 admin → 进 KP 详情 → 点 ✎ 编辑 → 保存
- **新增 KP**: admin UI 的 "+" 按钮 / `POST /api/kps` (带 Bearer token)
- **API**: 详见 `v2/public/docs/api-reference.md` (KP CRUD endpoints)

## 关键约束（验证脚本会拦截）

- ✅ 每个 KP 的 `discipline` 必须等于所在目录名
- ✅ 每个 KP 的 `schools[]` 中每个 key 必须在 `<discipline>/schools/` 下有对应文件
- ✅ 每个 KP 的 `scholars[]` 中每个 key 必须在 `<discipline>/scholars/` 下有对应文件
- ✅ 每个学派的 `concepts[]` 中每个 KP id 必须在 `<discipline>/kp/` 下有对应文件
- ✅ 同 discipline 下 KP id 唯一
- ✅ `updatedAt` 必须是合法 ISO 8601 UTC（结尾 Z）
- ✅ `body.zh` 里出现 `<strong>` 加粗个数应 ≈ `body.ja` 里 `<strong>` 个数（差异 > 30% 报警）

## 字段语义快速参考

详见 `v2/src/schemas/*.ts`（Zod 定义即文档）。
