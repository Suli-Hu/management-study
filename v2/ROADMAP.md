# v2 ROADMAP

engineering 会话轮替时读这里对齐。每次 commit 请同步状态列。

**当前版本**：v0.4.5 · **W3 收官 tag：v0.3.0** ✅
**当前阶段**：W4.1 编辑器全模块完成（KP/学派/学者 GET/PUT/POST/DELETE）。等用户改 UX 后再推 v0.4.3 可视化编辑器（quad/compare）或 W4.2 多学科。

---

## W3 — 稳定基础 + UX 核心补齐

### W3.1 — Learning 隔离 + 架构债

| 版本 | 内容 | 状态 | commit |
|---|---|---|---|
| v0.3.1 | `.gitignore` + `.engineering/` + memory `scope:` + pre-push hook | ✅ | `64db8c6` |
| v0.3.2 | A1 race + A3 cleanup + A4 rate limit | ✅ 合并执行 | `e07c701` |
| v0.3.3 | A9 XSS 防护（escInline + 白名单） + ROADMAP.md | ✅ | `030a3e8` |
| v0.3.4 | A2 wipe-cascade（migration 0005 + sync 增量 upsert + orphan cleanup） | ✅ | 本 patch |
| v0.3.5 | A5 signed cookie + CSRF Origin check（都改 middleware） | ✅ | 本 patch |
| v0.3.6 | A6 flash cookie + A7 email 移出 URL + A8 logger 统一 | ✅ | 本 patch |

#### W3.1 ✅ 全部完成（8 patch，A1-A9 全清）

### W3.2 — UX 核心补齐（v1 → v2 回补）

| 版本 | 内容 | 状态 |
|---|---|---|
| v0.3.7 | ~~KP "已会" 星标~~（v0.3.15 改为学派/学者收藏，见下） | ⚠️ 语义迁移 |
| v0.3.8 | ~~学派 inline 展开~~（方向错：v1 学科 index 是简单卡片，v0.3.11 回退） | ⚠️ 废弃 |
| v0.3.9 | **夜间模式** toggle + `prefers-color-scheme` 持久化 | ✅ |
| v0.3.10 | **Split-pane 双栏**（lg:1024 宽屏，fetch+swap，↑↓ 键切换；窄屏回退 /kp/[id]） | ✅ |
| v0.3.11 | **对齐 v1 导航**：回退学派 accordion（恢复扁平卡片）+ 学者页也套 split-pane | ✅ |
| v0.3.12 | **学者字段 100% 对齐 v1** + 设计系统落地（accent / full-height / `split-pane.js` 抽公共） | ✅ |
| v0.3.13 | 学派/学者页默认选中第一个 KP + 去「独立页面打开」入口 | ✅ |
| v0.3.14 | 修 3 个 theme 学派「未分组」bug | ✅ |
| v0.3.15 | **星标语义迁移**：KP 已会 → 收藏学派/学者；split-pane 左栏 380 → minmax(440, 520) | ✅ |

### W3.3 — 测试质量升级

| 版本 | 内容 | 状态 |
|---|---|---|
| v0.3.16 | learning-flow smoke 进 CI（`data/**`/`migrations/**`/`scripts/**` 触发，local miniflare D1） | ✅ |
| v0.3.16 | render-body 输入套件（空字段 / emoji / 多语言 / 破标签 / 不闭合 HTML / 巨长 body，28 新 case） | ✅ |
| v0.3.17 | Auth API 5 路由 integration tests（mock D1 + Request，21 case 覆盖 AUTH_MODE 网关 / cookie / flash 分支） | ✅ |
| v0.3.18 | Playwright E2E：登录 → 搜 → KP → 登出（chromium，9 specs，CI 自动 webServer） | ✅ |
| v0.3.0 | W3 tag 收官（138 vitest + 9 playwright + 3 CI workflow） | ✅ |

---

## W4 — 编辑器 + 多学科 + PWA

### W4.1 — 编辑器（admin 专用，isAdmin gate 已就绪）

| 版本 | 内容 | 状态 |
|---|---|---|
| v0.4.1 | 选型 doc（[EDITOR-DESIGN.md](docs/EDITOR-DESIGN.md)）+ `/api/edit/health` smoke + GITHUB_PAT/REPO env 接线（7 vitest case） | ✅ |
| v0.4.2 | KP text 编辑器 + toolbar + 双语 inline preview + GET/PUT/DELETE `/api/edit/kp/:id`（SHA 乐观锁，commit msg 带 admin email，updatedAt 服务端强制刷）；admin 铅笔入口在 KP 详情页 + 学派/学者 split-pane 列表项 hover-reveal ✎/✗（lg 视口）；硬删带二次 confirm；17 vitest case 全过；prod 端到端跑过 add-marker → revert 全绿 | ✅ |
| v0.4.3 | Quad / Compare / Accordion DSL ⟷ JSON 可视化编辑器 + roundtrip vitest | ❌ |
| v0.4.4 | 学派 / 学者 编辑/删除 UI + 学派 detail 「代表学者」section + 「+ 新增 KP/学派/学者」chip 入口（discipline index / scholars index / kp index / 学派 detail / 学者 detail）+ POST `/api/new/{kp,school,scholar}` + 三个 new 页 + i18n 空字段 omit-when-empty 修；20 vitest case；180 全过 | ✅ |
| v0.4.5 | 长按拖动重排 KP position | ❌ |
| ~~v0.4.6~~ | ~~移动端编辑手势~~ → 废案：编辑桌面 only | — |

### W4.2 — 多学科

| 版本 | 内容 |
|---|---|
| v0.4.7 | 与 learning 协商：marketing / finance / strategy / hr 哪个先做？先 1 个 × 10 KP 验证架构 |
| v0.4.8 | 选定学科 seed 在 `.engineering/` → validate 脚本多学科扫描 → learning 接手 |
| v0.4.9 | 多 admin 权限分离 `user_permission(user, discipline, role)` 表 + middleware 读权限（A10） |

### W4.3 — PWA + 离线

| 版本 | 内容 |
|---|---|
| v0.4.10 | `manifest.json` + icon set + Add to Home Screen |
| v0.4.11 | Service Worker（network-first + cache fallback），CACHE_VERSION = git SHA |
| v0.4.12 | PWA 回归测试套件（5 层金字塔） |

---

## W5 — cutover + Quiz + 深度功能

| 版本 | 内容 |
|---|---|
| v0.5.1-3 | Quiz / Flashcard 题库移植（`Main/js/quiz.js`）+ SRS 间隔算法 |
| v0.5.4-5 | KP 关联图谱可视化（学派 → 学者 → KP 网络图） |
| v0.5.6-7 | 用户笔记 user_note + 收藏夹（`locals.isGuest` 排除访客写入） |
| v0.5.8 | 打印 / PDF 导出（考前印一份） |
| v0.5.9 | UI/UX 打磨 + iPad Safari 坑清单收尾 |
| v0.5.10 | v1 vs v2 feature parity 100% 核验 |
| v0.5.11 | v1 Read-only 模式 + v2 banner 提示 |
| v0.5.12 | **Cutover** —— `management-study.pages.dev` DNS 切到 v2 |
| v0.5.0 | W5 tag = v1 退役 |

---

## W6 — AI 辅助 + 付费（按市场反应）

| 版本 | 内容 |
|---|---|
| v0.6.1-3 | AI 辅助生成 KP 草稿（Anthropic API）—— admin 输入概念 → 生成三语 body → 人工审 |
| v0.6.4-5 | AI 辅助小论文批改（日语答题 → 回馈可用 KP） |
| v0.6.6-8 | Stripe 付费订阅 + subscription 表 + feature gate |
| v0.6.9-10 | 用户学习报告（哪些 KP 没看 / 看过未"已会"） |
| v0.6.0 | W6 tag |

---

## W7 — 完整账户系统（v0.7.x，2026-05 完成）

把 v0.2-v0.6 累积的 5 种登录路径（邀请码 / magic-link / 6 位 code /
EMAIL_TRUST / password 模式）收敛为 SaaS 标准的"邮箱+密码"主路径，留邀请码作演示通道、password 模式作应急 fallback。

| 版本 | 内容 | commit |
|---|---|---|
| v0.7.1 | migration 0017 + `lib/password.ts` PBKDF2-SHA256 + `setup-admin.ts` env-read 注入 + 42 case 单测 | `145cd2f2` |
| v0.7.2 | `/signup` + 邮箱 6 位 code 验证 + `pending_signup` 表 + 28 case integration test | `c81dbda4` |
| v0.7.3 | `/login` 默认改 email+password + `login-password` 端点 + 锁定状态机 + 16 case | `99f15a77` |
| v0.7.4 | `/password-reset` 申请 + confirm + invalidate sessions + 21 case | `082b44a0` |
| v0.7.5 | `/settings/account` + 6 端点（profile / 改密 / 改邮箱 / 退所有 / 注销）+ migration 0018 + 31 case | `29870e7d` |
| v0.7.6 | 删 magic-link 路径（3 端点 + 6 helpers）+ EMAIL_TRUST_DAYS + 23 测试 case | `f67f4d2e` |
| v0.7.0 | E2E smoke spec + README/ROADMAP 更新 + tag | 本 patch |

**设计决策**（PRD v0.7）：
- D1: 保留邀请码 `123` 作演示通道
- D2: 删 magic-link 日常登录；reset link 仍用邮件
- D3: 开放注册，默认 0 学科权限（home 卡片置灰，v0.6.3 已有视觉）
- D4: super-admin 走 `pnpm setup:admin` 注入 password_hash（值不进 git）
- D5: 不做 OAuth（v0.8+ SaaS 阶段再说）

**保留护城河**（便于回滚）：`magic_link` 表 + `user.trusted_until` 列 schema 不动；password 模式 secrets 仍在。

---

## W8 — KP body 结构化重构（v0.8.x，5 stage）

把 KP `body: string` (DSL) 重构成 discriminated union per format，根除 format/body 不一致 bug。完整 PRD：[KP-BODY-STRUCTURED-PRD.md](docs/KP-BODY-STRUCTURED-PRD.md)。

| 版本 | Stage | 内容 | PR |
|---|---|---|---|
| v0.7.7-v0.7.36 | — | 中间版本号（学习 API + admin endpoints + 各种 hotfix），不属本 W 主线 | — |
| v0.7.37 | Stage 0 | KpBody discriminated union schema + helpers + types | #34 |
| v0.7.38 | Stage 1 | D1 双写过渡 + backfill admin endpoint | #35 |
| v0.7.39 | Stage 2 | 渲染层切新列 + fallback 告警 | #36 |
| v0.7.40 | hotfix | Stage 1+2 typecheck 修 | — |
| v0.7.41 | Stage 1+2 | 测试补洞 + audit/drift helper（52 invariants） | #38 |
| v0.7.42 | Stage 1+2 | evals 4 路径写入 null fallback 语义统一 | #39 |
| **v0.8.0** | **Stage 3** | **API contract hard cut** — POST/PATCH/batch 接 `KpBody`；6 个 `legacy_*` 422 + `migration_guide` URL；`evalContent` → `evaluations` 改名 + 6 子 key 英化；`GET /api/kps/empty-body`；`v2/public/docs/migration-v0.8.md` 真源 | #40 |
| v0.8.1 | Stage 3 docs | retrospective + fallback monitoring cheatsheet + ROADMAP W8 | #41 |
| **v0.8.2-0.8.4** | **Stage 4** | **编辑器整页重写 + F4/F5 backend** — 12 个 editor module (vanilla TS DOM) + design system v1.0 token swap + `kp-editor-v0.8` scope；F4 classifyZodFailure 默认 schema_invalid；F5 zh/ja format 强制一致；删全编辑器 ⓘ；compare cols UI max 4；**QuadAxis schema breaking** (yAxis/xAxis 拆 `{low, label?, high}` 对象)；migrate-quad-axes admin endpoint smart split | #42 |
| v0.8.5 | Stage 4 docs | PRD + Test plan + Test report + ROADMAP/memory update | 本 PR |
| v0.8.x | Stage 5 | drop 旧列 + git JSON 全量迁移（1d） | □ |

**设计决策**（PRD §13 6/6 confirmed，不再 review）：

- D1: `format` 字段在 body 内（不在顶层）
- D2: D1 双写过渡 + 最终 drop（3 道防线：默认读新 + 漂移检测 + 物理 drop）
- D3: API hard cut at v0.8.0（无双轨）
- D4: `evaluations` 独立顶层字段（body 内不再允许 `◆评价——`）
- D5: quad cells 严格 4
- D6: 串行 5 stage，单人开发，质量优于工期

**Stage 3 deferred to Stage 4**（Test Eng1 报告 finding，详见 [v0.8-rollout-plan.md](docs/v0.8-rollout-plan.md)）：
- F4 (P3): `classifyZodFailure` 把非 body 字段错归 `body_structure_invalid` — 应默认归 `schema_invalid`
- F5 (P2): schema 允许 `zh.format != ja.format`，旧列 `format` 只跟 zh — Stage 5 后自然消失，或编辑器侧强制同步

**老师 agent 通知**：deferred to Stage 5 完成后一并发（避免 Stage 4/5 期间二次迁移），届时给 [migration-v0.8.md](public/docs/migration-v0.8.md) URL。

---

## W8+ 长期

- **W8**: 多学科一次扩 3-4 个（marketing / HR / OB / 战略）
- **W9**: 社区笔记共享（user_note 加 public flag）
- **W10**: 移动 app（Capacitor / Expo）
- **W11**: 教师版 admin（批量导入 / 学生进度看板）——如真卖给补习机构

---

## 原始 audit 清单（engineering3 顾问评审）

🔴 必须修（W3 前）：

| # | 问题 | 文件 | 状态 |
|---|---|---|---|
| A1 | `findOrCreateUser` race condition | `auth.ts` | ✅ v0.3.2 |
| A2 | wipe-and-reload 级联删 user_note | `migrations/0005` + `sync-to-d1.ts` | ✅ v0.3.4 |
| A3 | Session 行永不清理 | `auth.ts` | ✅ v0.3.2 |
| A4 | Magic link code 无 rate limit | `auth.ts` | ✅ v0.3.2 |
| A5 | Middleware 每请求查 DB | `middleware.ts` | ✅ v0.3.5（signed cookie stateless） |

🟡 W3 顺手：

| # | 问题 | 状态 |
|---|---|---|
| A6 | `?error=` 在 URL 明文 → flash cookie | ✅ v0.3.6 |
| A7 | login `?email=xxx` redirect → 邮箱枚举泄漏 | ✅ v0.3.6 |
| A8 | `catch { /* noop */ }` silent → 统一 logger | ✅ v0.3.6 |
| A9 | render-body 未转义 emoji/sub → XSS 隐患 | ✅ v0.3.3 |

💭 扩展性：

| # | 问题 | 规划归宿 |
|---|---|---|
| A10 | `isAdmin` binary → `user_permission` 表 | W4.2 v0.4.9 |
| A11 | PWA 时 session cookie 需网络 → JWT + SW 缓存 | W4.3 |

---

## 测试策略（5 层金字塔）

```
层 5 [人工 smoke]    版本 release 前 iPad Safari 3 分钟核验（你做）
层 4 [Visual / E2E]  Playwright 本地跑（localhost:4321）+ CI 夜间跑
层 3 [Integration]   vitest + mock D1，测 API routes / middleware
层 2 [Unit]          vitest，纯函数 (55 测试已在，目标 +auth API integration)
层 1 [Static]        tsc --noEmit + zod schema validate（CI gate 已在）
```

### 现实约束 × 替代方案

| 约束 | 替代 |
|---|---|
| 开飞行模式 → Claude Code 断 | Playwright `context.setOffline(true)`（本地跑） / fetch mock in vitest |
| 不能拿 marketing seed 测（污染 learning） | `.engineering/` 目录 + `.gitignore` + 测试 KP id 前缀（v0.3.1 已加固） |
| CF Workers 不能跑 Playwright | CI 另起 ubuntu-latest job `pnpm preview` + playwright |
| 开 Chrome DevTools 会抢 Claude Code 的浏览器 | Safari / Firefox 手测；自动化全走 CI |

### 每 commit CI 必跑

1. `pnpm validate`（data schema + refs）
2. `pnpm test`（55 unit + 未来 integration）
3. `pnpm build`（Astro compile）
4. `pnpm test:learning-flow`（当 `data/` 改动）
5. Post-deploy HTTP smoke：footer SHA + 3 关键页面 200

### 每 W tag 前必跑

1. Playwright E2E（登录 / 搜 / KP / 语言切 / 登出）
2. 视觉 diff（iPad 768w + desktop 1280w）
3. Lighthouse（PWA + Performance + a11y ≥ 90）
4. 手动 iPad Safari 3min smoke

---

## Learning 隔离现状（v0.3.1 已加固）

✅ 已做：
- `v2/.gitignore` 拦截 `kt*` / `kfix_*` / `k[89]xxx` / `.engineering/`
- `v2/data/.engineering/` 原型目录 + README
- memory `scope: engineering-only` frontmatter（3 文件）+ `SCOPES.md` 注册表
- `test-learning-flow.ts` 加 SIGINT/exit handlers
- `scripts/pre-push-check.sh` 硬拦截测试数据入 git

engineering 碰 JS/CSS/UI + schema；learning（`epic-*` worktree）只碰 `data/*.json`。

---

## 版本号约定

`APP_VERSION = "0.W.X"` 手动 bump，显示在 footer ([src/lib/version.ts](src/lib/version.ts))。
`W` = 阶段（W3 = 0.3.x），`X` = patch。`0.3.0` 只在 W3 收官时打。
`GIT_SHA` = 构建时从 `PUBLIC_GIT_SHA` 注入，footer 显示前 7 位。
