---
name: 部署工作流 — 验证后自动 push
description: 2026-04-19 起 git push 自动部署，验证通过后可直接 push，无需逐次征求同意
type: feedback
---

**当前工作流（2026-04-19 起）：** GitHub Actions 自动部署，`git push origin main` = 部署上线。

**Why:** 每次 push 触发 `.github/workflows/deploy.yml`，~30-60 秒后 Cloudflare Pages 更新。因此"推送代码"和"部署"在本项目是**同一件事**。

## 默认行为：验证后直接 push，不问

用户 2026-04-19 明确说："每次改完源代码都可以自动 push"。

**完成流程：** 写代码 → 自测通过 → `git commit` → `git push origin main` → 部署完成。

**不需要每次问"要 push 吗？"** —— 用户觉得啰嗦。

## 什么时候 **仍然要问**

- **有破坏性风险**：清理数据、大范围重构、字段删除、URL 变化、可能影响线上用户体验的重大 UI 改动
- **未充分验证**：测试没跑完、只看了单一场景、回归断点没覆盖
- **用户明确在等另一个会话**：比如 learning Claude 正在改 data，我们要 push 先问是否会冲突

判断标准：**如果 push 后线上行为变化是用户已预期的、且可回滚的 → 直接 push**；**否则问一次**。

## 查部署

- Actions 状态：https://github.com/Suli-Hu/management-study/actions
- 线上：https://management-study.pages.dev/

## Secrets（已配，勿动）

- `CLOUDFLARE_API_TOKEN`（Pages:Edit）
- `CLOUDFLARE_ACCOUNT_ID` = `784cdc716fa5e0f1835e48061078e74f`

## 历史命令（已弃用）

```
# 旧方式 1: wrangler 直传（Actions 已替代）
wrangler pages deploy Main/ --project-name management-study --branch main --commit-dirty=true
# 旧方式 2: Netlify（项目已迁移）
netlify deploy --prod --dir=Main
```
