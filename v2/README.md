# Management Study v2

下一代学习笔记 SaaS — 多学科 / 用户系统 / 付费墙。

## Stack

- **Astro 5** — SSG/SSR hybrid，CF Pages 一等支持
- **TypeScript strict** — 类型安全
- **Tailwind 3 + v1 design tokens** — 视觉一致 + 开发速度
- **Cloudflare D1** — SQLite-compatible 边缘数据库（KP + 用户数据）
- **Lucia Auth + Resend Magic Link** — 自托管邮件登录（W2）
- **Stripe** — 订阅（W3，可选）
- **Zod** — 数据 schema 验证 + 回归测试基石

## 数据来源（learning workflow）

KP 数据存在 `data/<discipline>/<schoolKey>/<kpId>.json`。

```
data/
  keiei/                    # 经营学
    change/
      k562.json             # 双元组织
      k625.json
    org_learning/
      k557.json
      ...
  marketing/                # 后续添加
    ...
```

**learning Claude 的工作流**（W1 完成后）：

```bash
# 1. 改 / 加 KP（每个 KP 一个 JSON 文件）
vim data/keiei/change/k627.json

# 2. 本地验证
pnpm validate              # schema + cross-ref + cn-ja parity
pnpm dev                   # 本地起 server 看效果

# 3. push
git add data/ && git commit -m "Add k627" && git push

# GitHub Actions 自动：validate → sync to D1 → 部署
# ~30 秒后 v2.management-study.pages.dev 可见
```

## 开发

```bash
pnpm install               # 装依赖
pnpm dev                   # 本地 dev server (http://localhost:4321)
pnpm build                 # 构建
pnpm preview               # 预览构建产物
pnpm test                  # 跑回归测试
pnpm validate              # 仅跑数据 schema 校验
```

## 部署

```bash
# 第一次：建 D1 数据库
wrangler d1 create management-study-v2
# 把返回的 database_id 写入 wrangler.toml

# 之后：push 到 main 自动部署（见 .github/workflows/deploy-v2.yml）
```

## 与 v1 关系

- v1 (`Main/`) 仍在跑 (`management-study.pages.dev`)
- v2 (`v2/`) 同 repo 独立项目 (`v2.management-study.pages.dev`)
- W1 闭环后 learning **立即切换**到 v2 工作流（不再加 KP 到 v1）
- W4 cutover：v2 替代 v1 域名
