---
name: v2 D1 + Astro 技术坑清单
description: v2 (Astro 5 + D1 + CF Pages) 已踩过的坑 — 写新 SQL / 新页面前先看
type: project
scope: engineering-only
originSessionId: d05102e4-0b67-492d-a1d8-5bef3c98442a
---
v2 stack：Astro 5 SSR + Cloudflare Pages + D1 (SQLite-compatible)。

## 🪤 D1 SQL `IN (?,?,...)` 上限 ~100 binds

D1 比 SQLite 默认严，超 100 个 placeholder 直接挂 `too many SQL variables at offset N`。

**Why:** 2026-04-24 写 KP 目录页，给 169 个学者做 lookup 用 `WHERE key IN (?,?,...,?)`，169 个 bind 直接报错。

**How to apply:** 同一 discipline 范围的 lookup → 改用外键过滤 `WHERE discipline = ?` 一次拉全表（数据量到几千都没问题，远比 IN-list 安全）。如果真要按 keys 过滤且 N 可能 > 100，就分块查询。

## 🪤 本地 D1 (miniflare) 跨 worktree 不共享，默认空

`pnpm dev` 用的是 `.wrangler/state/v3/d1/` 下的本地 SQLite，新 worktree 完全空。第一次 dev 看到 `no such table: discipline` 都是这原因。

**How to apply:** 新 worktree 第一次起 dev 前：

```bash
cd v2
pnpm exec wrangler d1 migrations apply management-study-v2 --local
pnpm sync:d1
pnpm exec wrangler d1 execute management-study-v2 --local --file=.wrangler/sync.sql
```

`setup.sh` 现在还没含本地 D1 步，要么补进去，要么手记着。

## 🧭 学者排序 = 按姓氏（= JSON key）

scholar JSON 的 `name.en` 存全名 "Abraham Harold Maslow"，按 name_en 排会把 Maslow 放到 A 段。**正确做法**：按 `key` 排（key 就是姓氏 lowercase，如 `maslow`、`porter`），刚好对应学界惯例 surname-first。

**Why:** 2026-04-24 写 `/[discipline]/scholars/index.astro` 第一版按 name_en 排，Maslow 错位到 A，已修。

## 🌐 v2 Pages URL

实际 URL = `https://management-study-v2.pages.dev/`（CF Pages 默认 `<project-name>.pages.dev`），**不是** `v2.management-study.pages.dev`（那是 custom subdomain，未配）。

## 🪤 wrangler 3.x D1 import 间歇性 fail "Not currently importing anything"

GitHub Actions deploy-v2 偶尔挂在 `Sync shard 01 meta+wipe`，错误：
```
🌀 Processed 534 queries.
✘ [ERROR] Not currently importing anything.
```

**根因**：wrangler 3.114.17（pinned 在 `cloudflare/wrangler-action@v3` 默认）的 D1 import API 异步轮询时机 bug —— SQL 已经写入完成，但 finalize 调用没拿到 import handle 就 exit 1。**数据已落地**，只是 workflow 误标 fail → 后续 shards + deploy Pages 都跳过。

**Why:** 2026-04-26 v0.4.36 deploy 挂这条，gh run rerun --failed 重跑就 OK。

**How to apply:**
- 临时：`gh run rerun <id> --failed` 重跑通常能成功
- 长期：升级到 wrangler 4.x（log 自己提示），需测试 deploy-v2.yml 兼容性
- 不要根据这条 fail 的 log 误判为代码 bug —— 先 rerun 看是否过
