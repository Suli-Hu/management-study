> ## ⚠️ Archived as of 2026-05
>
> **本目录是 v0/v1 旧版站点（vanilla JS + JSON 数据），已停止开发与部署。**
>
> - 不再有 GitHub Actions 自动部署（`.github/workflows/deploy.yml` 已删）
> - prod 域名 `management-study.pages.dev` 冻结在最后一次部署的状态
> - 所有新 KP / 编辑 / 部署一律走 [v2/](../v2/)（线上 `study.sususu.org`）
> - 本目录仅保留作历史参考与回查（git history 完整）
>
> 想接手维护？看 [v2/README.md](../v2/README.md)。

---

# 経営管理学派全览（archived）

日本大学院経営学研究科入试备考用知识库与练习系统。

## 功能

- **学派全览**（55个学派卡片） — 按ミクロ(OB)/マクロ(OT)/戦略(SM)分类，含斯科特四象限、明茨伯格十大战略学派、院校学派
- **学者目录**（169位学者） — 生卒年、所属学派、代表理论、学术贡献
- **知识点**（512个） — 中日双语body，手风琴分组展开，支持中文/English/日本語三语搜索
- **理论框架** — 人间模型四阶段演变、斯科特四象限等可视化框架图
- **在线练习** — Gemini 2.5 Flash驱动的AI出题，按学派/知识点定向练习

## 技术栈

| 组件 | 技术 |
|------|------|
| 前端 | 纯HTML/CSS/JS单文件（index.html） |
| 数据 | data.js（学派/学者/知识点）+ data_ja.js（日文翻译） |
| 练习API | Cloudflare Worker + Gemini 2.5 Flash |
| 题库缓存 | Cloudflare KV |
| 部署 | Cloudflare Pages（静态站点） |

## 文件结构

```
index.html        — 主页面（全部UI逻辑）
data.js           — 学派、学者、知识点数据
data_ja.js        — 知识点日文翻译（DATA_JA）
questions.js      — 练习题数据
school_quiz.js    — 练习功能逻辑
logos/             — 大学校徽SVG
worker/
  index.js         — Cloudflare Worker（练习API）
  knowledge_base.js — Worker用知识库
  wrangler.toml    — Worker配置
```

## 部署

**静态站点（Cloudflare Pages）：**
```bash
wrangler pages deploy ./ --project-name management-study --branch main --commit-dirty=true
```

**线上地址：** https://management-study.pages.dev/

**练习API（Cloudflare Worker）：**
```bash
cd worker && npx wrangler deploy
```
