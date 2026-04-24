# v2 ROADMAP

engineering 会话轮替时读这里对齐。每次 commit 请同步状态列。

**当前版本**：v0.3.4
**当前阶段**：W3.1 清债进行中（A9 + A2 已清；A5 / CSRF / A6-A8 待清）

---

## W3 — 稳定基础 + UX 核心补齐

### W3.1 — Learning 隔离 + 架构债

| 版本 | 内容 | 状态 | commit |
|---|---|---|---|
| v0.3.1 | `.gitignore` + `.engineering/` + memory `scope:` + pre-push hook | ✅ | `64db8c6` |
| v0.3.2 | A1 race + A3 cleanup + A4 rate limit | ✅ 合并执行 | `e07c701` |
| v0.3.3 | A9 XSS 防护（escInline + 白名单） + ROADMAP.md | ✅ | `030a3e8` |
| v0.3.4 | A2 wipe-cascade（migration 0005 + sync 增量 upsert + orphan cleanup） | ✅ | 本 patch |
| v0.3.5 | A5 signed cookie + CSRF Origin check（都改 middleware） | ❌ 未做 | — |
| v0.3.6 | A6 flash session + A7 去 email param + A8 logger 统一 | ❌ 未做 | — |

#### W3.1 剩余 3 项（下个 patch 起清）

- **A5 — middleware 每请求查 DB（N+1）**
  源头：[src/middleware.ts](src/middleware.ts) 每请求 `getSessionUser()` 查 D1。
  修复方向：signed cookie（HMAC with `SESSION_SECRET`）承载 user id + expires，
  middleware 只做 HMAC verify，不查 DB；或 LRU in-memory cache。
  当前影响：页面加载多一次 D1 round-trip (~20ms)，页面资源也算——PWA 时更痛。

- **CSRF — Origin check middleware**
  源头：`SESSION_SECRET` env 已预留未用，所有 POST 路径 (`/api/auth/*`) 只靠 Astro 默认 Origin check。
  修复方向：middleware 对 state-changing method（POST/PUT/DELETE）强制 Origin ∈ allowlist。
  当前影响：外部 form 跨域 POST 可过 Astro 默认一层。

- **A6 / A7 / A8 — 小账**（v0.3.6 一次清）
  A6 `?error=` 在 URL 明文 → flash session；
  A7 login `?email=xxx` redirect → 邮箱枚举泄漏；
  A8 `catch { /* noop */ }` silent → 统一 logger。

### W3.2 — UX 核心补齐（v1 → v2 回补）

| 版本 | 内容 | 状态 |
|---|---|---|
| v0.3.5 | **Split-pane 双栏**（宽屏左 KP 列表 + 右详情，↑↓ 切换；窄屏单栏） | ❌ |
| v0.3.6 | **学派 inline 展开**（学科页点学派不跳转，当场 accordion） | ❌ |
| v0.3.7 | **KP "已会" 星标 + localStorage 进度** | ❌ |
| v0.3.8 | **夜间模式** toggle + `prefers-color-scheme` 持久化 | ❌ |

### W3.3 — 测试质量升级

| 版本 | 内容 | 状态 |
|---|---|---|
| v0.3.9 | Auth API 5 路由 integration tests（mock D1） | ❌ |
| v0.3.10 | render-body XSS 输入套件（emoji / 破标签 / 空字段） | ❌ |
| v0.3.11 | Playwright E2E：登录 → 搜 → KP → 登出 | ❌ |
| v0.3.12 | learning-flow smoke 进 CI（data/ 改动触发） | ❌ |
| v0.3.0 | W3 tag 收官 | ❌ |

---

## W4 — 编辑器 + 多学科 + PWA

### W4.1 — 编辑器（admin 专用，isAdmin gate 已就绪）

| 版本 | 内容 |
|---|---|
| v0.4.1 | **技术选型 doc**：GitHub API → JSON → push 方案细节（auth/冲突/preview） |
| v0.4.2 | KP text 编辑器 + 格式 toolbar（◆ 义/限/例/strong/br）→ 保存触发 GitHub API commit → 30s D1 sync |
| v0.4.3 | Quad / Compare / Accordion 可视化编辑器（DSL ⟷ JSON roundtrip test） |
| v0.4.4 | 学派 / 学者 新增/编辑/删除 UI（admin 专用） |
| v0.4.5 | 长按拖动重排 KP position |
| v0.4.6 | 左滑 → 编辑 / 删除快捷按钮 |

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

## W7+ 长期

- **W7**: 多学科一次扩 3-4 个（marketing / HR / OB / 战略）
- **W8**: 社区笔记共享（user_note 加 public flag）
- **W9**: 移动 app（Capacitor / Expo）
- **W10**: 教师版 admin（批量导入 / 学生进度看板）——如真卖给补习机构

---

## 原始 audit 清单（engineering3 顾问评审）

🔴 必须修（W3 前）：

| # | 问题 | 文件 | 状态 |
|---|---|---|---|
| A1 | `findOrCreateUser` race condition | `auth.ts` | ✅ v0.3.2 |
| A2 | wipe-and-reload 级联删 user_note | `migrations/0005` + `sync-to-d1.ts` | ✅ v0.3.4 |
| A3 | Session 行永不清理 | `auth.ts` | ✅ v0.3.2 |
| A4 | Magic link code 无 rate limit | `auth.ts` | ✅ v0.3.2 |
| A5 | Middleware 每请求查 DB | `middleware.ts` | ❌ 欠（v0.3.5） |

🟡 W3 顺手：

| # | 问题 | 状态 |
|---|---|---|
| A6 | `?error=` 在 URL 明文 → flash session | ❌（v0.3.6） |
| A7 | login `?email=xxx` redirect → 邮箱枚举泄漏 | ❌（v0.3.6） |
| A8 | `catch { /* noop */ }` silent → 统一 logger | ❌（v0.3.6） |
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
