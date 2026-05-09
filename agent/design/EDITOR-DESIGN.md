# W4.1 编辑器技术选型（v0.4.1）

**目标**：admin 在浏览器里编辑 KP / 学派 / 学者，保存即生效（≤90s 用户可见）。
**Non-目标**：实时多人协作、富文本所见即所得、版本回滚 UI（git 自带）。

---

## 不变量（不能破）

1. **`data/*.json` = 单源**。D1 是派生缓存，可任何时候从 JSON 重建。
2. **Git 是唯一审计**。所有改动有 commit 记录可 revert。
3. **Learning 隔离**。`epic-*` worktree 直接编 JSON，不走编辑器，不能被 admin 写覆盖（同一文件 last-write-wins 即可，编辑器不触 learning 数据流）。
4. **schema 验证**。写入前必须过 `src/schemas/index.ts` zod 校验，与 `pnpm validate` 同一套规则。

---

## 三条路径对比

| 路径 | 写时机 | 用户可见延迟 | git 历史 | 复杂度 |
|---|---|---|---|---|
| **A: GitHub API → JSON commit → CI sync** | commit 触发 deploy-v2.yml | 60–90s | ✅ 完整 | 低 |
| B: 直接写 D1 + 异步反向写 JSON | D1 即时 + git 异步 | 即时 | ⚠️ 滞后/可能丢 | 高 |
| C: 双写（D1 即时 + 同请求 commit JSON） | D1 即时 + git 同步 | 即时 | ✅ 完整 | 高（部分失败模式多） |

**推荐 A**。理由：
- 守住「JSON 单源」不变量 → learning 工作流零冲击
- 复用现成 deploy-v2.yml（已绿）→ 不引入新失败面
- 60–90s 延迟在「单 admin、批改课件」场景可接受
- 交互上加一个 inline preview（renderBody 是纯函数，浏览器 JS 直接渲染）→ 保存前已知道效果，不依赖 deploy

排除 B/C：D1 反向写需要重生成 schema 一致的 JSON，drift 风险高；双写一旦中间失败就两边状态不一致，需要补偿逻辑。

---

## 路径 A 详细设计

### 1. Auth：GitHub PAT（fine-grained）→ CF secret

- 在 GitHub Settings → Developer settings → Personal access tokens (fine-grained)
  - Repo: 仅 `Suli-Hu/management-study`
  - Permissions: `Contents: Read & Write`（其它一律不给）
  - 过期：90 天，到期前提醒重发
- CF Pages Dashboard 加 secret `GITHUB_PAT`
- 服务器侧通过 `Authorization: Bearer <GITHUB_PAT>` 调 [Contents API](https://docs.github.com/rest/repos/contents)
- middleware 已有 `locals.isAdmin` gate；编辑路由再加一道 `if (!locals.isAdmin) return 403`

### 2. 写流程（PUT contents）

```
1. 浏览器 → POST /api/edit/kp/:id { json, base_sha }
2. 服务器：
   a. 验 isAdmin
   b. 验 zod schema
   c. base_sha 与 GH 当前 file SHA 对比 → 不一致返 409
   d. 调 PUT /repos/.../contents/v2/data/keiei/kp/<id>.json
      Body: { message, content: base64(json), sha: base_sha, branch: main }
   e. 成功 → 返 { commit_sha, deploy_eta_seconds: 90 }
3. 浏览器：显示「已提交，~90s 后生效」+ poll commit status
```

### 3. 冲突处理

GitHub Contents API 自带乐观锁：PUT 必须带 `sha`，与 server 端不一致返 409。
- **场景 1**：admin 同时开两个 tab 改同一 KP → 第二个 tab 收 409 → 提示「文件已被改动，请刷新」+ 把对方版本 diff 给看
- **场景 2**：admin 改 KP A，learning 同时也改 KP A（罕见，但同人不同 worktree 可能） → 看谁先 push。后到的：CI 失败 if 同行冲突 / 自动合并 if 不同行。**MVP 不做冲突 UI**，依赖 git push 失败保护。

### 4. Preview

- **保存前**：浏览器 inline render KP body via `renderBody()`（纯函数，bundle 引入即可）
- **保存后**：不做实时 preview。编辑页显示 commit SHA + deploy 倒计时（依赖 `https://api.github.com/repos/.../actions/runs` 查 deploy-v2.yml 状态）
- **不做 draft 分支**：MVP 直接 commit main。理由：admin 是单一可信主体，且 inline preview 已经覆盖 99% 错误。代价：偶有写错需要再发一次 commit revert。

### 5. 失败模式

| 失败 | 表现 | 处理 |
|---|---|---|
| zod 校验不过 | 400 + 字段错误列表 | 浏览器表单显示 |
| 409 SHA 冲突 | 409 + 服务端 diff | 浏览器提示刷新 |
| GitHub API 限流（5000/h） | 429 | 退避重试 1 次，仍失败提示「稍后再试」|
| GitHub API down | 5xx | 同上 |
| CI deploy 失败 | commit 进了 git 但 D1 没更新 | 用户看不到改动 + Actions 红，admin 收到 GitHub 通知 |
| CF secret `GITHUB_PAT` 缺失/过期 | 401 from GH | 启动时校验：admin 进编辑页前 ping `/api/edit/health` |

### 6. 安全

- PAT 仅 Contents R/W，无 workflow / actions / settings 权限 → 失窃也只能改 data/，不能改 deploy 流程
- middleware 已有 CSRF Origin 检查 → 编辑 POST 自动覆盖
- 编辑路径加 `data-` 前缀路径白名单：`/v2/data/{discipline}/{kp|schools|scholars}/*.json` 之外的路径一律拒绝（防 path traversal）

---

## 增量计划（修订自 ROADMAP W4.1）

| 版本 | 内容 |
|---|---|
| **v0.4.1** ✅ | 本 doc + GitHub PAT + CF secret + `/api/edit/health` smoke |
| **v0.4.2** ✅ | KP 文本编辑器（GET/PUT/**DELETE**）+ 学派/学者 split-pane KP 列表项 hover-reveal ✎/✗ |
| v0.4.3 | Quad / Compare / Accordion DSL ⟷ JSON 可视化编辑（DSL roundtrip vitest） |
| v0.4.4 | **新增** KP / 学派 / 学者（+ 学派/学者整对象编辑/删除）—— hero ✎ + 「+ 新增」chip |
| v0.4.5 | 长按拖动重排 KP `position`（kp_school 关联表的 position 字段） |
| ~~v0.4.6~~ | ~~左滑 → 编辑 / 删除快捷按钮~~（移动端编辑废案，见决策 3） |

**v0.4.2 范围调整**：原计划「删除留 v0.4.4」，但 V1 模式 ✎/✗ 在 KP 列表项上一起 hover 出，分两期会断裂入口。所以 v0.4.2 收尾合并：DELETE 路由 + 二次 confirm。新增 KP / 学派 / 学者整对象 CRUD 仍留 v0.4.4。

---

## 已拍板的决策（v0.4.2 起步前）

1. **commit message 模板** = **带人**：`v2: edit kp/{id} by {admin_email}`
   - 理由：将来加 admin（W4.2 v0.4.9 `user_permission` 表）后，老 commit 不用 grep 抓瞎
   - 实现：服务端从 `locals.user.email` 取，模板字符串拼接

2. **删 KP** = **硬删**：直接 `DELETE /repos/.../contents/...json`
   - 理由：MVP 单用户、`user_progress` 表无 KP 级数据（v0.3.15 后星标已挪学派/学者）
   - 撤销：git revert + 重新 commit（接受成本）
   - 升级路径：未来需要学习追踪/错题本 → migration 加 `deprecated` 字段，老数据默认 false，所有查询补 `WHERE deprecated = 0`

3. **平台** = **桌面 only**
   - 移动端编辑不做（textarea 长内容 + toolbar 在 iPad/手机上手感差，没人会真用）
   - 浏览功能仍全平台支持
   - 编辑入口（铅笔图标等）只在 `≥1024px` 视口显示

4. **批量编辑** = **不做**：rename school key、移 KP 学派之类的批量操作走 worktree + push，不进编辑器
