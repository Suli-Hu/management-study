---
name: 部署 = git push，推前必须问用户
description: 2026-04-19 起改 GitHub Actions 自动部署，git push 等同部署，因此推前必须征得用户同意
type: feedback
---

**当前工作流（2026-04-19 起）：** GitHub Actions 自动部署，`git push origin main` = 部署上线。

**Why:** 每次 push 会触发 `.github/workflows/deploy.yml`（用 `cloudflare/wrangler-action@v3`），~30-60 秒后 Cloudflare Pages 更新。因此"推送代码"和"部署"在本项目是**同一件事**。

**How to apply:**
- 本地 `git commit` 随便做（不会触发部署）
- `git push origin main` **必须先征得用户同意** — 等同于部署到线上
- 不要再手动跑 `wrangler pages deploy`，重复了
- 查部署状态：https://github.com/Suli-Hu/management-study/actions
- 线上地址：https://management-study.pages.dev/

**Secrets（repo settings，已配好，勿动）：**
- `CLOUDFLARE_API_TOKEN`（有 Pages:Edit 权限）
- `CLOUDFLARE_ACCOUNT_ID` = `784cdc716fa5e0f1835e48061078e74f`

**历史命令（已弃用，不要再用）：**
```
# 旧方式 1: wrangler 直传（现在由 Actions 自动做，别手动重复）
wrangler pages deploy Main/ --project-name management-study --branch main --commit-dirty=true

# 旧方式 2: Netlify（项目已从 Netlify 迁移，此命令失效）
netlify deploy --prod --dir=Main
```
