# Anytime Study (v2)

**多学科知识记录平台** — 给学科编写者沉淀知识，给学习者按章节浏览。

线上：`management-study-v2.pages.dev`（v0.4.33）

---

## 产品定位

知识被分成 4 个层级，逐层下钻：

```
学派组（theme）       例：个体的世界 / 人与人之间 / 古典组织论
  └─ 学派（school）    例：行为主义学派 / 人际关系学派
      └─ 学者（scholar）  例：马斯洛 / 库尔特·勒温
          └─ 知识点（KP） 例：需求层次理论 / 三阶段变革模型
```

**4 层都支持增/删/改/查**，每层有专属编辑器和字段。学派组可拖排，学派可拖出/拖入主题，KP 可在学派内拖排。

数据是 **GitHub JSON 文件 + D1 缓存**，所有写改 → git commit + GitHub Actions sync 到 D1，跨设备一致。

## 用户模型（per-discipline RBAC）

| 角色 | 含义 |
|---|---|
| **super-admin** | 写在 `wrangler.toml` ADMIN_EMAILS 的邮箱，所有学科 god mode |
| **学科 admin** | 该学科编辑/维护者，CRUD 全 |
| **学科 guest** | 该学科只读 |
| **无权限** | 学科首页卡片灰锁 🔒，不能进 |
| **invite-guest** | 邀请码 123 登录，全学科只读，共用一个 user_id |

> 同一邮箱在不同学科可以是任意角色组合。例如"经营 admin + 金融 guest + marketing 灰锁"。

### 加白工作流

super-admin 跟 AI 对话："给 alice@x.com 经营学 admin、金融学 guest"，AI 跑：

```sh
wrangler d1 execute management-study-v2 --remote --command \
  "INSERT INTO user_permission(user_id, discipline_key, role, granted_at, granted_by) VALUES \
   ('<alice_user_id>','keiei','admin',  '$(date -u +%FT%TZ)','husuli'), \
   ('<alice_user_id>','finance','guest','$(date -u +%FT%TZ)','husuli');"
```

新邮箱首次登录会自动建 user 行（magic-link 机制）。

## 登录

两条路径（`/login`）：

1. **邀请码**（默认 tab）：演示码 `123` → 全学科 guest 视角
2. **邮箱验证码**：邮箱 + 30 天勾 → 收 magic-link 链接 / 6 位 code，按 `user_permission` 表权限进入

## 4 层数据 schema 速查

| 层级 | 文件 | 必填字段 | i18n | 关联 |
|---|---|---|---|---|
| 学派组 | `data/<disc>/discipline.json` 内嵌 `themes[]` | key / title.zh / accent | title{zh,en?,ja?} / desc{zh,ja?} | schools[] |
| 学派 | `data/<disc>/schools/<key>.json` | key / discipline / title.zh / themeKey / summary.zh | title{zh,en?,ja?} / summary{zh,ja?} | concepts[]（KP id） |
| 学者 | `data/<disc>/scholars/<key>.json` | key / discipline / name.zh / contribution.zh / born | name{zh,en?,ja?} / contribution{zh,ja?} | schools[] |
| KP | `data/<disc>/kp/<id>.json` | id / discipline / year / title.zh / body.zh / schools[≥1] | title{zh,en?,ja?} / body{zh,ja?} | schools[] / scholars[] |

**自动派生**（不要手填）：
- `school.accent` ← theme.accent（sync 时强制）
- `scholar.accent` ← schools[0] → school → theme.accent（fallback 链）
- `kp.tags` ← `deriveTagsFromBody(body.zh)`（v0.4.9）

详见 `src/schemas/*.ts` 和 [Main/FORMAT.md](../Main/FORMAT.md)（learning agent 看的 KP 创建指南）。

## Stack

- **Astro 5** SSG/SSR hybrid + Cloudflare Pages
- **TypeScript strict**（CI typecheck 卡门，v0.4.20+）
- **Tailwind 3** + 三色 accent 体系（OB 绿 / OT 橙 / SM 蓝 / warning 红）
- **Cloudflare D1** SQLite-compatible 边缘 DB
- **Magic-link 邮箱登录** + 邀请码（v0.4.33+）
- **Zod** schema 校验 + cross-ref（sync 时 fail-fast）
- **Resend** 发邮件
- **GitHub Contents + Tree API** 写数据（admin 编辑器）

## 写数据流程（learning agent / admin）

两条等价路径：

### A. 本地编辑 JSON
```bash
vim data/keiei/kp/k627.json
pnpm validate            # zod + cross-ref（含 themeKey ∈ discipline.themes[].key）
git add ... && git commit -m "..." && git push
# ~90s 后 GitHub Actions 自动 sync 到 D1，线上生效
```

### B. admin UI
访问 `/keiei/kp/new` 或 `/keiei/kp/<id>/edit` → 表单 → POST/PUT → 后端 GitHub commit → 自动部署。

详见 [Main/CONTRIBUTING.md §3 V2 数据流程](../Main/CONTRIBUTING.md)。

## 开发

```bash
pnpm install
pnpm dev                 # http://localhost:4321
pnpm test                # 234 vitest + 10 playwright
pnpm typecheck           # CI 卡门
pnpm validate            # 数据 schema + cross-ref
pnpm sync:d1             # 生成 .wrangler/sync/*.sql
```

## 部署

push 到 `main` → `.github/workflows/deploy-v2.yml` 自动跑：

```
typecheck → test → build → sync D1 → deploy CF Pages
```

## 与 v1 关系

- v1 (`Main/`) 仍在 `management-study.pages.dev`
- v2 (`v2/`) 在 `management-study-v2.pages.dev`
- W5 cutover：v2 替代 v1 域名（ROADMAP.md）
- learning 已切 v2 数据流（V1 data.js 停用读写，详见 Main/CONTRIBUTING.md §3）

## 文档导航

- `ROADMAP.md` — 工作阶段路线图
- `SETUP.md` — 初次部署
- `docs/` — 设计决策记录
- `Main/CONTRIBUTING.md` — learning workflow + KP 生成 6 原则
- `Main/FORMAT.md` — KP 创建指南（教学法 + 字段映射）
