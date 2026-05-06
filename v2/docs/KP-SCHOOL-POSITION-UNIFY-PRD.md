# kp_school.position 单段化重构 PRD

> 状态：v0.11.1 Stage 1 ✅ + v0.11.3 Stage 2/Bug B/webhook ✅ + v0.11.4 Stage 3 主修复 进行中
> 起源 issue：用户改 KP 名字后，学派内 KP 拖拽顺序丢失 + tag 色丢失（4C 案例）
> 适用版本：v0.11.x（按 stage 分 patch 发布）

## 修订日志
- **v0.11.1**: Stage 1 migration 0023 — kp_school.position 规范化 0..N-1
- **v0.11.3**:
  - Stage 2: 学派 PATCH UPDATE-only（不再 DELETE+INSERT）
  - Bug B 修复 (D)：chipPicker Enter / blur 自动选中第一匹配项（防"输入不点下拉就保存"卡死）
  - Bug B 修复 (E)：下拉视觉小修（max-height 320 / align-items center / 第一项高亮）
  - Bug B 真因清理：删 webhook handler + reconcile.yml（git push 反向覆盖 D1 是 v0.8.27 漏网之鱼）
- **v0.11.4**: Stage 3 主修复 — KP PATCH/CREATE 改 delta 模式 + 清理 sync-based workflows
  - patchKpRecord：kept schools 不动 position（4C 改名顺序丢失彻底修复）；removed/added 走 delta
  - createKpRecord：新建 KP 在每个 school 内塞头部（决策点 #1=b）
  - 单元测试 v2/tests/kp-school-delta.test.ts (5 tests) 覆盖 PRD §7.1 T1/T3/T4/T6/T7
  - 删 .github/workflows/learning-flow-smoke.yml + playwright-e2e.yml（v0.8.27 漏网，依赖 git data sync 永久 fail，邮件骚扰）

---

## 1. 背景与问题

`kp_school` join 表（管"哪个 KP 属于哪个学派、显示在第几位"）的 `position` 字段当前被切成两段：

| 段位 | 写入端点 | 含义 |
|---|---|---|
| `< 1000` | 学派编辑页拖拽 KP 顺序 | 用户拖出来的"知识点显示顺序" |
| `>= 1000` | KP 编辑页 schools 字段 | KP 自声明属于哪些学派（`1000 + i` for `i in schools 数组`） |

学派 PATCH 重写自己时**只删 `< 1000`**（保留 KP-driven），但 KP PATCH 改任何字段时**全删（不分段）**——这导致 KP 改名/改 tag 等无关操作把学派拖拽顺序误伤删了。

### 真实事故（2026-05-06）
1. 用户在学派"营销管理总论"编辑页把 KP `4c` 拖到中间
2. 用户进 KP 编辑页改名 `4c → 4c理论`
3. KP PATCH 跑 `DELETE FROM kp_school WHERE kp_id='4c'` → 拖拽行被连带删
4. 重新插入只在 `>= 1000` 段 → `4c` 在学派内的位置变成 `1000`，按 `position ASC, kp_id ASC` 排序后跑到列表错位置
5. 用户回来发现：KP 顺序乱、tag 色丢失（tag 色丢失是另一条独立 bug，见 §10）

### 根因
段位制是 v0.4 为了让两个端点互不踩硬切的，但代价是**两端必须严格对称**地遵守"各管各段"——任何一端的 DELETE 写错就出事。设计本身脆弱。

---

## 2. 目标

取消大小段制，`position` 字段语义统一为：
> **该 KP 在该学派下的显示顺序号**，连续段位 `0..N-1`，无分段。

不再有"两个端点各管各段"的隐式契约。两个端点的写入路径明确：
- 学派 PATCH：负责重写学派内顺序（UPDATE position only，不增删行）
- KP PATCH：负责增删 KP→学派关系行（按 delta 处理）

---

## 3. Schema 改动

`kp_school` 表结构不变（`kp_id, school_key, position`），仅 position 语义变更。无 migration schema DDL，只有 data migration（§6）。

---

## 4. API 行为变化

### 4.1 KP PATCH — [v2/src/lib/kp-api-store.ts:413-531](../src/lib/kp-api-store.ts)

**改前**（line 507-517）：
```ts
db.prepare('DELETE FROM kp_school WHERE kp_id = ?').bind(kpId),
// ... (delete kp_scholar, kp_fts, insert kp_fts)
nextSchools.forEach((schoolKey, i) => {
  stmts.push(... INSERT INTO kp_school ... position = 1000 + i);
});
```

**改后**（delta 模式）：
```ts
const removedSchools = current.schools.filter(s => !nextSchools.includes(s));
const addedSchools = nextSchools.filter(s => !current.schools.includes(s));
// kept = current ∩ next：完全不动 kp_school

// 1. 删除被取消勾选的 schools（连同 position 一起清，决策点 #5）
removedSchools.forEach(schoolKey => stmts.push(
  db.prepare('DELETE FROM kp_school WHERE kp_id = ? AND school_key = ?').bind(kpId, schoolKey)
));

// 2. 新增 schools：塞头部（决策点 #1=b）
//   每个新 school 内：① SHIFT 现有行 position +1, ② INSERT 新行 position=0
addedSchools.forEach(schoolKey => {
  stmts.push(
    db.prepare('UPDATE kp_school SET position = position + 1 WHERE school_key = ?').bind(schoolKey)
  );
  stmts.push(
    db.prepare('INSERT INTO kp_school (kp_id, school_key, position) VALUES (?, ?, 0)').bind(kpId, schoolKey)
  );
});

// 3. kept schools：不动 kp_school（用户 schools 数组顺序不影响 position，决策点 #4=a）
```

**注意**：D1 batch 内 SQL 顺序保证（SHIFT 在 INSERT 之前），不会出现 position=0 冲突。

### 4.2 学派 PATCH — [v2/src/lib/school-api-store.ts:262-325](../src/lib/school-api-store.ts)

**改前**（line 316-320）：
```ts
db.prepare('DELETE FROM kp_school WHERE school_key = ? AND position < 1000').bind(key),
// ...
next.concepts.forEach((kpId, position) => {
  stmts.push(... INSERT OR IGNORE INTO kp_school ... position = position);
});
```

**改后**：
```ts
// 校验：input.concepts 必须包含该学派下当前全部 KP（决策点 #2=a）
const currentKpsRows = await db
  .prepare('SELECT kp_id FROM kp_school WHERE school_key = ?')
  .bind(key)
  .all<{ kp_id: string }>();
const currentSet = new Set(currentKpsRows.results.map(r => r.kp_id));
const inputSet = new Set(next.concepts);
if (currentSet.size !== inputSet.size ||
    ![...currentSet].every(id => inputSet.has(id))) {
  return { ok: false, status: 422, reason: 'concepts_set_mismatch',
           detail: { current: [...currentSet], input: next.concepts } };
}

// 不删不插，只 UPDATE position
next.concepts.forEach((kpId, position) => {
  stmts.push(
    db.prepare('UPDATE kp_school SET position = ? WHERE kp_id = ? AND school_key = ?')
      .bind(position, kpId, key)
  );
});
```

### 4.3 KP CREATE — [v2/src/lib/kp-api-store.ts:~396](../src/lib/kp-api-store.ts)

新建 KP 等于"全部 schools 都是 added"，复用 4.1 的 added 分支：每个 school SHIFT +1，INSERT (kpId, schoolKey, 0)。

### 4.4 学派 CREATE — [v2/src/lib/school-api-store.ts:~250](../src/lib/school-api-store.ts)

新建学派时 input.concepts 通常为空（先建学派、再填 KP）。如非空，按 input.concepts 顺序 INSERT (kpId, key, i)。无变化。

---

## 5. 数据迁移

文件：`v2/migrations/0023_normalize_kp_school_position.sql`（顺延 0022_kp_drop_legacy_columns）

```sql
-- 按 (school_key, 当前 position ASC, kp_id ASC) 重新打号 0..N-1
-- 显示顺序保持不变，只是号码变连续

WITH ranked AS (
  SELECT
    kp_id,
    school_key,
    ROW_NUMBER() OVER (
      PARTITION BY school_key
      ORDER BY position ASC, kp_id ASC
    ) - 1 AS new_position
  FROM kp_school
)
UPDATE kp_school
SET position = (
  SELECT new_position FROM ranked
  WHERE ranked.kp_id = kp_school.kp_id
    AND ranked.school_key = kp_school.school_key
);
```

**性能**：D1 SQLite 跑 ROW_NUMBER + UPDATE FROM CTE，~几百行毫秒级。可在线跑。

**幂等性**：跑第二次结果不变（数据已规范化）。

**回滚**：D1 Time Travel 30 天 PITR。

### 同款 migration 也要跑 kp_scholar 吗？

`kp_scholar` 表也有相同 join 表 + position 段位（[kp-api-store.ts:519](../src/lib/kp-api-store.ts) 写 `position = 1000 + i`）。但**目前没有"学者编辑页拖拽 KP 顺序"功能**（前端无此 UI），所以 `< 1000` 段从来没人写过——没有混合数据，不需要洗。

**但代码层面同款 bug 仍在**（line 508 全删）。Stage 4 顺手对齐 kp_scholar 的实现，避免未来加学者拖拽功能时复发。

---

## 6. Stage 划分

按 [feedback_prd_first_refactor.md](../../../.claude/projects/-Users-husuli-Documents-Web-Project/memory/feedback_prd_first_refactor.md)「分 stage 独立可发」原则。

| Stage | 内容 | 独立可发？ | 风险 |
|---|---|---|---|
| **1** | Migration `0023_*.sql` 跑数据规范化 | 是 — 跑完不影响现有逻辑（旧代码继续按 position ASC 排序，结果一样） | 低 |
| **2** | 学派 PATCH 改成 UPDATE-only（4.2） | 是 — 上线后学派拖拽行为不变，仅内部 SQL 变化 | 低 |
| **3** | KP PATCH 改成 delta 模式（4.1） + KP CREATE 同步（4.3） | 是 — 修复主 bug，用户立刻感知 | 中（动主路径） |
| **4** | kp_scholar 同款修复（kp-api-store.ts:508） | 是 — 防御性修复，无可见行为变化 | 低 |

每个 stage 单独 PR、独立 commit、bump version patch（0.9.1 → 0.9.4）。

**关键依赖**：Stage 1 必须先于 Stage 2/3，否则新逻辑读到混合段数据会错。Stage 2 和 Stage 3 之间无依赖（可并行 PR），但建议 2 先 3 后（学派端简单、用作小白鼠验证 D1 batch 行为）。Stage 4 任意时候做。

---

## 7. 测试计划

### 7.1 单元测试（v2/tests/）

新增 `v2/tests/kp-school-position.test.ts`：

- **T1**：KP 改名 → 学派内顺序保持
  - Setup: 学派 A 下 3 个 KP，position [0,1,2]
  - Act: PATCH KP_2 改 title
  - Assert: 学派 A 下 KP 顺序仍是 [0,1,2]，position 字段不变

- **T2**：学派拖拽 → 顺序持久化
  - Setup: 学派 A 下 3 个 KP，position [0,1,2]
  - Act: PATCH 学派 A 的 concepts 改成 [KP_3, KP_1, KP_2]
  - Assert: position 变成 KP_3=0, KP_1=1, KP_2=2

- **T3**：KP 加新学派 → 塞头部
  - Setup: 学派 B 下 2 个 KP，position [0,1]
  - Act: PATCH KP_X schools=[..., 'B'] 加入学派 B
  - Assert: 学派 B 下 position：KP_X=0, 原 KP_a=1, 原 KP_b=2

- **T4**：KP 删学派 → 直接消失（无孤儿）
  - Setup: KP_X 在学派 A、B；学派 B position=5
  - Act: PATCH KP_X schools 去掉 B
  - Assert: 学派 B 查 KP_X → 无该行；学派 B 内剩余 KP position 不变（不补洞）

- **T5**：学派 PATCH 缺 KP → 422
  - Setup: 学派 A 下 3 个 KP
  - Act: PATCH 学派 A concepts 只传 2 个
  - Assert: 422 + reason='concepts_set_mismatch'

- **T6**：KP schools 改顺序但集合不变 → kp_school 完全不动
  - Setup: KP_X schools=[A,B]，A.position=3, B.position=5
  - Act: PATCH KP_X schools=[B,A]
  - Assert: A.position 还是 3, B.position 还是 5（决策点 #4=a）

### 7.2 Migration 测试

`v2/tests/migration-0023.test.ts`：
- 模拟混合段数据 → 跑 migration → 验证 position 连续 0..N-1，且显示顺序不变
- 跑两次 → 结果幂等

### 7.3 手动验收（在用户的 prod admin 浏览器）

- 重新触发 4C 案例：在学派"营销管理总论"拖动 4C 到中间，再到 KP 编辑页改名，回学派详情页验证 4C 仍在中间位置
- KP tag 色：（独立 bug，见 §10）

---

## 8. 风险与回滚

| 风险 | 概率 | 影响 | 缓解 |
|---|---|---|---|
| Migration SQL D1 不支持 CTE+UPDATE | 低 | 高（迁移不能跑） | 本地 D1 先验，失败则改成两步 SQL（先 SELECT 出来打号，再循环 UPDATE） |
| Stage 3 KP PATCH delta 写错（漏 case） | 中 | 高（数据丢失） | 完整单元测试覆盖 7.1 T1-T6 |
| Stage 2 学派 PATCH 422 误伤老前端（前端发不全 KP） | 低 | 中（学派编辑挂） | 先看现有 [school-form.ts:save](../src/lib/editor/school-form.ts) 是否真的全量发 — 已确认：`concepts: [...state.concepts]` 是全量 |
| 跨 stage 部署期间状态混乱 | 中 | 中 | Stage 1 必须先跑完才能 ship Stage 2/3；Stage 之间独立 PR，每个 PR 跑完 deploy + 验证再起下一个 |

**回滚**：D1 Time Travel 30 天 PITR；代码层面每个 stage 单独 commit，可单独 revert。

---

## 9. 不在本次范围

- 学派 form 不引入"删除/新增 KP"功能（现在仍只能拖拽，加 KP 仍走 KP 编辑页 schools 勾选）
- KP form 的 schools 数组顺序在 UI 上不显示意义（决策点 #4 已确认）— 但**不主动拿掉拖拽手柄**，保留前端 state 顺序（不用即可）
- KP 颜色逻辑不动（仍 KP.tags[0] → discipline.tags[].color）

---

## 10. 关联但独立的 bug

> **不在本 PRD 修复范围**，单独排查 + PR

**Bug A：4C 改名后 tag 色丢失**
- 现象：4C 改名后 KP 详情页 tag chip 消失
- 推测：KP 编辑表单初始化或 save 时 `state.tags` 被清空 / PATCH 发了 `tags: []`
- 排查方向：[v2/src/lib/editor/index.ts:420](../src/lib/editor/index.ts) 的 save payload；[v2/src/pages/[discipline]/kp/[id]/edit.astro](../src/pages/[discipline]/kp/[id]/edit.astro) 的 record.tags 注入路径

**Bug B：学派 tags 改"战略选择"后变回 Drucker×Levitt×Marketing Myopia×1.0-5.0**
- 现象：学派编辑保存有 toast，回来仍是旧值
- 待用户提供：浏览器 F12 Network 面板 PATCH 请求的 status code + 响应 body

---

## §13 决策点确认（2026-05-06 用户确认）

| # | 决策点 | 确认值 |
|---|---|---|
| 1 | KP 编辑页加新学派时新行 position 给哪里 | **(b) 塞头部**（先 SHIFT +1，INSERT position=0） |
| 2 | 学派 form 拖拽时前端 payload 传全量还是只传变化的 | **(a) 全量传** input.concepts；缺 KP 报 422 |
| 3 | Migration 怎么洗老数据 | **同意**：按 (school_key, 当前 position ASC, kp_id ASC) 重新打号 0..N-1 |
| 4 | KP 编辑页 schools 数组顺序影响颜色吗 | **(a) 无关**：颜色来自 KP.tags[0] → discipline.tags[].color |
| 5 | KP 编辑页取消勾选某学派时怎么处理 | **(a) 直接 DELETE**，不留孤儿数据 |

---

## 实施约定

- 按 [feedback_prd_first_refactor.md](../../../.claude/projects/-Users-husuli-Documents-Web-Project/memory/feedback_prd_first_refactor.md)：每 stage 单独 PR，commit message 带 stage 编号
- 按 [feedback_version_announce.md](../../../.claude/projects/-Users-husuli-Documents-Web-Project/memory/feedback_version_announce.md)：每个 stage commit 前 bump v2/package.json patch
- 按 [feedback_engineering_ship_checks.md](../../../.claude/projects/-Users-husuli-Documents-Web-Project/memory/feedback_engineering_ship_checks.md)：push 后必查 deploy v2 workflow + tests/typecheck
- 按 [feedback_pm_end_to_end_ship.md](../../../.claude/projects/-Users-husuli-Documents-Web-Project/memory/feedback_pm_end_to_end_ship.md)：PR 起后 PM 自动等 CI + merge + verify
