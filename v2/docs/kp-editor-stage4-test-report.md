# v0.8.2 Stage 4 (PR #42) 测试报告

**Test Eng3** · 2026-05-04 · branch `claude/hopeful-edison-18975f` (基于 PR #42 HEAD `fb9cea5c`)

---

## 1. 总评：**GO** ✅

PR #42 backend + 编辑器实施扎实，测试覆盖到位，全部 P0 gate 通过。建议合并；P2 findings 不阻塞。

**核心理由**：
- Dev 写的 760 case 全过 + Test Eng3 补的 44 case 全过 → 总 804 passed / 0 failed / 10 skipped
- F4/F5 通过 endpoint integration (Dev) + schema-level direct (Test Eng3) + helper-level direct (Test Eng3) 三层覆盖，语义一致
- token swap / D2=B / Q6 grep 全清，PRD §11 决策点全部体现在代码
- jsdom page-level 整合测试覆盖 17 case 整页 + 4 个 5×4 lead carry-over 路径，证明 11 个 module 联动正确

**Caveat**（非阻塞）：本地无 D1 + .dev.vars 环境，**playwright E2E spec 已写但未本地运行**。建议合并前 PM 在 staging 跑一次 `pnpm test:e2e` 验证 cookie 路径 + iPad Mini 322 截图。

---

## 2. P0 跑通情况

| # | gate | 结果 | 备注 |
|---|---|---|---|
| P0.1 | typecheck + vitest 全套 | **804 passed / 10 skipped / 0 failed** (51 files) | Dev 760 + Test Eng3 +44 |
| P0.2 | F4 + F5 backend (3 层覆盖) | ✅ | endpoint integration (Dev T2.2/T6.3/T8.1/F4.1-5/F5.1-5) + schema direct (Test Eng3 14 case) + helper direct (Test Eng3 13 case) |
| P0.3 | token swap grep | ✅ | v0.8 编辑器 section (line 1-1070) 0 hex / 0 #007AFF / 0 --accent-strategy；学派 chip 全 `--tag-*` token；D2=B 0 复制按钮；Q6 0 排序按钮 |
| P0.4 | F5 schema-level 强制 | ✅ | `KpCreateInput.parse({zh:narrative, ja:flat-list})` → 422 + path `body.ja.format` + message 含 "必须一致（v0.8.2 F5 强制）" |
| P0.5 | Q5 lead carry-over | ✅ jsdom 17 case (含 4 个 5×4 sample path) + Dev state.test.ts 5×4=20 全 round-trip | playwright spec 已写但 Test Eng3 本地未运行 |
| P0 verify | format-switcher 5×4=20 | ✅ Dev `state.test.ts:95-109` 一个 test loop 覆盖全 20 path；Test Eng3 jsdom 整合 4 sample path 走完 confirmDialog + 真实 form 重渲染 |

### 2.1 vitest 详细统计

```
Test Files  51 passed (51)
Tests       804 passed | 10 skipped (814)
Duration    2.46s
```

| 套件 | case |
|---|---|
| Dev tests/editor/* (state/format-switcher/forms/api) | 86 (state 27 + format-switcher 16 + forms 14 + api 13 + ...) |
| Dev tests/kps-v08-stage3-supplement.test.ts (含 F4+F5 endpoint 11 case) | 64 |
| Dev tests/kps-* (api/batch/meta/mutation/v08-contract) | 113 |
| Dev tests/* 其它 | 481 |
| **Dev 小计** | **760** |
| Test Eng3 tests/kp-bilingual-format-refine-f5.test.ts | 14 |
| Test Eng3 tests/kp-legacy-detector-f4.test.ts | 13 |
| Test Eng3 tests/editor/integration-format-switch.test.ts | 17 |
| **Test Eng3 小计** | **44** |
| **总** | **804** |

### 2.2 关键 case verbatim 验证（spot-check）

- **F4 修复**：`tests/kps-v08-stage3-supplement.test.ts:T6.3 + T8.1` 已翻案 — `id` 非法 path=['id'] → `schema_invalid`（不再 anonymous 422）；顶层 unknown key path=[] → `schema_invalid`（不再 body_structure_invalid）。
- **F5 修复**：`KpBodyBilingual.refine` (kp-api.ts:38-44) + `KpBodyBilingualPartial.refine` (kp-api.ts:71-77) 均加 `zh.format === ja.format` 检查；error message + path 一致。
- **D5 schema-level**：`POST` body `{zh.format=narrative, ja.format=flat-list}` → 422 + reason=`body_structure_invalid` + detail JSON 含 `format.*必须一致`（matched in supplement F5.1 line 1330）。

### 2.3 P0.3 grep verbatim 输出

```
=== HEX in v0.8 section (line 1-1070 of kp-edit.css) ===
0 hits ✅

=== --accent-strategy in v0.8 section ===
0 hits ✅

=== D2=B 复制 zh / copy zh in src/lib/editor/ ===
0 hits ✅

=== Q6 sort/order/move buttons in src/lib/editor/ ===
0 hits ✅

=== rgb / rgba / black / white literals in src/lib/editor/ ===
0 hits ✅
```

**学派 chip token verify**（positive grep）：

```
src/styles/kp-edit.css:528-535 — 8 学派 chip 全用
  oklch(from var(--tag-{mgmt|mkt|soc|purple|pink|cyan|blue|orange}) ...)
src/lib/editor/relations-panel.ts:19-26 — TAG_TOKENS 数组定义同 8 token
```

---

## 3. P1 跑通情况

| 维度 | 状态 | 说明 |
|---|---|---|
| P1.1 a11y A1-A8 | ⚠️ 未在 worktree 跑 playwright | error banner role="alert" + aria-live="assertive" 已在 index.ts:181-182 落地（jsdom 整合测试 grep verify） |
| P1.2 F5 sync btn | ✅ helper-level | `EditorStore.syncJaFormatToZh()` (state.ts:213-219) 实现 + Dev test 2 case；UI sync 按钮覆盖在 lang-tabs.ts |
| P1.3 help-popover | ⏭ 未做 — PRD §6.7 deferred 未在 Stage 4 实施 | Dev `index.ts:248-264` 用普通 `<a target="_blank">` 简版 ⓘ link，**不是** popover (符合 minimalism — link 比 popover 更简) |
| P1.4 dark mode | ✅ token | `kp-edit.css:51-52` 用 `[data-mode="dark"]` selector 覆盖 OKLCH token；自动跟 global.css 切换 |
| P1.5 U6 错误分支 | ✅ jsdom smoke (1 case) + playwright spec (1 case 待运行) | 422 reason banner / 5xx network / 409 conflict 错误分类全在 api.ts:33-148（Dev test 13 case） |
| P1.6 prod audit `format != format` | ⏭ 未跑 — 需 prod admin endpoint | Stage 5 drop 旧列时自然消失；现在 hard cut + F5 schema 强制写入 = 不会引入新脏数据 |

### 3.1 jsdom 整合测试覆盖（Test Eng3 添加，**无需 dev server**）

| describe | case | 覆盖点 |
|---|---|---|
| initEditor DOM 结构 | 3 | mount → topbar / body / format-bar / section title "F5 强制" |
| format-switcher 弹 confirm dialog | 3 | dirty body → dialog ✓ / cancel 不变 ✓ / confirm + lead carry-over ✓ |
| zh + ja format 同步切 (F5) | 1 | 双语 KP 切 narrative→compare 后 ja 同步切 |
| D2=B 单语种边界 | 1 | ja=null tab 切到 ja → 占位 + "开始填 ja" 按钮 + DOM grep "复制 zh" = 0 |
| Q6 顺序固定 | 4 | flat-list / accordion / compare / quad form 内 0 个 sort/move/上下/+cell/-cell 按钮 |
| Q5 lead carry-over 整页 sample | 4 | narrative→flat-list / flat-list→narrative / accordion→quad / compare→narrative |
| save 错误 fetch mock | 1 | mock 422 → error banner 显示 reason |

**总 17 case，全 pass。**

### 3.2 playwright E2E spec（已写，待 dev server 运行）

`v2/tests/e2e/kp-editor-stage4.spec.ts` — 8 个 describe (16 case 跨 chromium + ipad-mini 项目)：

- Q5 lead carry-over: 加载 / 切 + carry / cancel
- D2=B 单语种 / Q6 顺序固定 grep
- U6 422 mock → error banner
- iPad Mini viewport (322px scrollWidth + touch target ≥ 44×44)

**未本地运行原因**：worktree 无 `.dev.vars` + `.wrangler/` + 种子 KP `m1`。spec 已 typecheck pass + playwright `--list` 解析正常，环境就绪即可跑。

---

## 4. Findings

### F1 (P2) PR description 中关于 OKLCH 字面量的描述不准确

**现象**：PR #42 description 称 "0 hex / rgb 字面量（仅 dialog backdrop 用 `oklch(0 0 0 / 0.35)` 一处直 OKLCH）"。

**实际**：在 `v2/src/styles/kp-edit.css` v0.8 section (line 1-1070) 共有 **5 处** 直接 OKLCH 字面量：

| line | 用途 |
|---|---|
| 457 | `box-shadow: 0 8px 24px oklch(0 0 0 / 0.10)` (dropdown shadow) |
| 556 | `.kpe-chip-x:hover { background: oklch(0 0 0 / 0.06) }` (hover overlay) |
| 579 | `box-shadow: 0 8px 24px oklch(0 0 0 / 0.10)` (popover shadow) |
| 891 (×2) | `box-shadow: 0 20px 60px oklch(0 0 0 / 0.15), 0 4px 16px oklch(0 0 0 / 0.08)` (dialog shadow) |
| 900 | `dialog::backdrop { background: oklch(0 0 0 / 0.35) }` (dialog backdrop, PR 描述仅此 1 处) |

**严重程度**：**P2** — 不是 PRD §6.2 token requirement 违规（要求是 0 hex，不是 0 直接 OKLCH），但 PR description 不准确。这些 oklch black-with-alpha 是合法的 shadow/overlay 用法，token 化 over-engineering。

**建议修法**：不需要修代码。**PR description 文字小调整**："0 hex / rgb 字面量（仅 dialog/dropdown 阴影 + dialog backdrop 用 OKLCH black-alpha 表达 — 5 处，全是浅 alpha shadow/overlay，无需 token 化）"。或者在 v0.8.x 后续做 `--shadow-color` token 抽象（不阻塞 ship）。

### F2 (P2) format-switcher.test.ts 案例数比 PR description 略低

**现象**：PR description 称 "tests/editor/format-switcher.test.ts | 16 case"。实际 grep `^  test\(` = 11 行 + 1 个 `test.each(['narrative', 'flat-list', 'accordion', 'compare', 'quad'])` (5 case) = 实际 runtime 16 case。

**严重程度**：**P2** — PR description 准确，验证方法不同导致初看疑似不一致。**无需 action**。

### F3 (P2) F4 supplement.test.ts T2.2 reason 翻案与 spec §3.3 略有差异

**现象**：Test Eng2 plan §3.3 翻案表说 T2.2 (zh+ja 不同 format) 翻案后应 expect `reason 含 refine message`。Dev 实施时 `T2.2` (line 195-198) expect `reason='body_structure_invalid'` + `detail JSON match /format.*必须一致/`。

**分析**：实际行为 reason **就是** `body_structure_invalid`（refine 触发的 zod issue path 是 ['ja','format']，包含 'body' 前缀变 ['body','ja','format'] → touchesBody=true → body_structure_invalid 分类）。Dev 写法语义正确；Test Eng2 plan 表述不够精确。

**严重程度**：**P2** — 测试通过且语义正确，doc 表述歧义。无需 action，建议 v0.8.x doc cleanup 时统一。

### F4 (P3) iPad Mini playwright project 现在让所有 e2e spec 都跑两次

**现象**：Test Eng3 加 `ipad-mini` project 后，现有 `auth.spec.ts` / `navigation.spec.ts` / `v07-auth-flow.spec.ts` 也会在 iPad Mini viewport 跑一遍 → CI 时间翻倍 (12 case → 23 case)。

**严重程度**：**P3** — 对 CI 时间有轻微影响，但 mobile viewport 跑这些 spec 也能 surface bug。

**建议修法（可选）**：在不需要 mobile 验证的 spec 顶部加 `test.skip(({ project }, info) => info.project.name === 'ipad-mini', 'desktop only')` 或调 `playwright.config.ts` 的 ipad-mini `testIgnore` 限定到 `kp-editor-*.spec.ts`。**Stage 4 ship 不阻塞。**

### F5 (P3) help-popover 模块未实施（PRD §6.7 + 测试 plan §2.13）

**现象**：测试 plan §2.13 列出 `help-popover.test.ts` 4 case；PR description 没列这个 module。Dev 实际用 `v2/src/lib/editor/index.ts:248-264` 的 helpLink — 一个简单的 `<a target="_blank">` ⓘ link 跳到 `/docs/kp-field-guide.md#anchor`，**没有** popover hover/click 弹窗。

**分析**：这是 **minimalism 决策**（与 D2=B 一致 — 用户能点 link 不需要 popover）。PRD §6.7 实施细节 deferred。Dev 用更简方案符合 user feedback `feedback_minimalism_default.md`。

**严重程度**：**P3** — 不阻塞 ship。如果 PM 后期想加 popover，重做即可（现在 link 也工作）。

### F6 (P2) PRD `KP-EDITOR-V0.8-PRD.md` 不在 PR #42 内

**现象**：PR description 链接 `https://github.com/Suli-Hu/management-study/blob/claude/nifty-dubinsky-5d4a51/v2/docs/KP-EDITOR-V0.8-PRD.md`，但 PR diff 没含此文件 — 文件在 PM worktree (`tender-robinson-8a19f8`) 未推到 PR branch。

**严重程度**：**P2** — review 时看不到 PRD 全文，PR description 链接 404。

**建议修法**：merge 前 Dev 把 PRD 复制进 PR (cherry-pick from PM worktree) 或 PM 单开一个 docs PR。**不阻塞 ship 但应跟。**

### F7 (P2) Test Eng2 scaffold 中 22 个 `test.todo` 已被 Test Eng3 实现

**现象**：Test Eng2 worktree (`lucid-johnson-e9a538`) `tests/kp-bilingual-format-refine-f5.test.ts` + `tests/kp-legacy-detector-f4.test.ts` 共 22 `test.todo`。Test Eng3 把 schema-level 路径全部转成实测（共 27 case，比 Test Eng2 plan 还多 5 个边界 case）。

**严重程度**：**P2** — 这是补强，不是 finding；记录这里以让 PM 知道 scaffold 已落地。

---

## 5. Ship 建议

### GO 条件（已满足）

- ✅ CI 全绿 (typecheck + vitest 804 pass)
- ✅ §11 决策点 (Q1-Q7 + D1-D6) 全部体现在代码 — token swap / D2=B / Q6 / F5 schema / format selector 位置 / new.astro 独立 page
- ✅ F4 + F5 backend 修在 endpoint + schema + helper 三层全 pass
- ✅ jsdom page-level 整合测试 17 case 全 pass — 等价于 playwright E2E core flow

### NO-GO 条件（无）

- 无 P0 阻塞 finding
- 无 schema/contract 回归
- 无 token swap 漏（学派 chip 全 `--tag-*`，0 #007AFF 旧蓝，0 hex literal）

### PM 决策点

1. **F1（OKLCH 文字描述）**: 修 PR description / merge 直推？ — 推荐 merge 直推（不影响代码语义）
2. **F4（iPad Mini auth/nav 跑两次）**: 收 testIgnore 缩小 ipad-mini scope / 留 broad coverage？ — 推荐留 broad（mobile viewport surface bug 价值 > 几秒 CI 时间）
3. **F6（PRD 不在 PR）**: 让 Dev cherry-pick PRD / 单开 docs PR / 不补？ — 推荐 merge 后 PM 单开 docs PR（合并主线优先，PRD 历史 record 价值次）
4. **playwright E2E 实跑**: ship 前在 staging deploy 上跑一次 / 信赖 jsdom 整合 + helper-level 直接 ship？ — 推荐 staging 跑一次（cookie 路径 + iPad Mini viewport 截图）；如果不便，可 ship 后立即 smoke

---

## 6. 附录：测试代码位置

### 新增（Test Eng3 worktree, branch `claude/hopeful-edison-18975f`, commit `96d9ce3`）

| 文件 | case | 用途 |
|---|---|---|
| `v2/tests/kp-bilingual-format-refine-f5.test.ts` | 14 | F5 KpCreateInput / KpBodyBilingualPartial / KpPatchInput refine 直测 |
| `v2/tests/kp-legacy-detector-f4.test.ts` | 13 | F4 classifyZodFailure helper-level 路径分流 |
| `v2/tests/editor/integration-format-switch.test.ts` | 17 | jsdom 整页：initEditor + format-switch + lead carry + D2=B/Q6 grep + save 错误 |
| `v2/tests/e2e/kp-editor-stage4.spec.ts` | 8×2(project) | playwright E2E spec（待 dev server） |
| `v2/playwright.config.ts` | (modify) | +iPad Mini 322×768 project |

### Cherry-pick from Test Eng2 worktree (`lucid-johnson-e9a538`)

| 文件 | 状态 |
|---|---|
| `kp-editor-v0.8-test-plan.md` | 已 copy 到 worktree 根 (747 行) |
| `tests/kp-bilingual-format-refine-f5.test.ts` (scaffold) | Test Eng3 重写为实测 14 case |
| `tests/kp-legacy-detector-f4.test.ts` (scaffold) | Test Eng3 重写为实测 13 case |

### Dev tests in PR #42（已存在，Test Eng3 全 verify pass）

| 文件 | case |
|---|---|
| `v2/tests/editor/state.test.ts` | 27 (含 5×4 lead round-trip) |
| `v2/tests/editor/format-switcher.test.ts` | 16 (`bodyHasContent` 5 fmt × 边界) |
| `v2/tests/editor/forms.test.ts` | 14 (5 form module DOM smoke) |
| `v2/tests/editor/api.test.ts` | 13 (错误分类 7 category) |
| `v2/tests/kps-v08-stage3-supplement.test.ts` | 64 (含 F4.1-5 + F5.1-5 + T2.2/T6.3/T8.1 翻案) |

---

## 7. 时间统计

- 上下文加载（PR + plan + memory + 模块代码）：~25 min
- 设置 + cherry-pick + iPad Mini config：~10 min
- F4 + F5 schema-level + helper 直测实施：~30 min
- jsdom 整页整合测试设计 + 实施：~25 min
- E2E spec 写 + typecheck 修：~15 min
- 报告撰写：~25 min

**实际：~2 h 10 min**（在 1.5-2.5h 预算内）

---

**Test Eng3 终判：GO ✅ — 建议合并 PR #42。**

PM session 可读本报告 + worktree commit `96d9ce3` 的 5 个新测试文件 (1871 line insertions)。
