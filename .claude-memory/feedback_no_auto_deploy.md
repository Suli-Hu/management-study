---
name: 部署工作流 — 验证后自动 push
description: 2026-04-19 起 git push 自动部署，验证通过后可直接 push，无需逐次征求同意
type: feedback
originSessionId: 83912dfd-dab7-4ab8-81fc-2b38245f101f
---
**当前工作流（2026-04-19 起）：** GitHub Actions 自动部署，`git push origin main` = 部署上线。

## 默认行为：验证后直接 push

用户 2026-04-19 明确说："每次改完源代码都可以自动 push"。

**流程：** 写代码 → 自测通过 → `git commit` → `git push origin main` → 部署完成。**不需要每次问"要 push 吗？"**

## 仍然要问的情况

- 破坏性改动（清理数据、大范围重构、字段删除、URL 变化、重大 UI 改版）
- 未充分验证（测试没跑、只看单一场景、回归断点没覆盖）
- 跨会话冲突风险（learning 正在改 data，我们 push 可能产生冲突）

判断：**push 后线上行为变化是用户已预期且可回滚 → 直接 push；否则问一次。**

## 相关信息

- Actions 状态：https://github.com/Suli-Hu/management-study/actions
- 线上：https://management-study.pages.dev/
- Secrets 已配：`CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID`=`784cdc716fa5e0f1835e48061078e74f`

## 历史命令（弃用）

旧方式 1: `wrangler pages deploy Main/ --project-name management-study --branch main --commit-dirty=true`（Actions 替代）
旧方式 2: `netlify deploy --prod --dir=Main`（项目已迁移）
