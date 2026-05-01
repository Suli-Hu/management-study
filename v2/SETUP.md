# v2 首次 Setup（W1 完成后跑一次）

每个步骤后我会标注**你做** / **CI 自动做**。

## 1. 安装依赖（你做，1 次）

需要 Node 18+ 和 pnpm。如果没装：

```bash
# macOS
brew install node pnpm
# 或
npm i -g pnpm
```

进入 v2 目录装依赖：

```bash
cd v2
pnpm install
```

## 2. 跑一次性数据迁移：v1 → JSON 文件（你做，1 次）

```bash
cd v2
pnpm migrate:from-v1
```

会在 `v2/data/keiei/` 下生成：
- `discipline.json`
- `schools/<key>.json` × ~55
- `scholars/<key>.json` × ~169
- `kp/<id>.json` × ~513

完成后 commit 这些 JSON 到 git：

```bash
git add v2/data/
git commit -m "v2: migrate v1 data to JSON files"
```

## 3. 校验数据（你做，验证迁移正确）

```bash
cd v2
pnpm validate           # schema + cross-ref
pnpm test               # vitest 回归
```

应该看到 `✓ All checks passed.` 和绿色测试结果。

## 4. 创建 Cloudflare D1 数据库（你做，1 次）

```bash
cd v2
wrangler d1 create management-study-v2
```

返回的 `database_id` 填到 `v2/wrangler.toml`：

```toml
[[d1_databases]]
binding = "DB"
database_name = "management-study-v2"
database_id = "粘贴这里"
```

```bash
git add v2/wrangler.toml
git commit -m "v2: configure D1 database id"
```

## 5. 应用 D1 schema migrations（你做，1 次）

```bash
cd v2
wrangler d1 migrations apply management-study-v2 --remote
```

## 6. 本地 dev 验证（你做，可选但推荐）

```bash
cd v2

# 应用 migrations 到本地 D1（仅本地）
wrangler d1 migrations apply management-study-v2 --local

# 生成 sync SQL 并跑到本地 D1
pnpm sync:d1:local

# 启动 Astro dev server
pnpm dev
```

打开 http://localhost:4321 — 应该能看到首页 → 学科 → 学派 → KP 详情完整链路。

## 7. 部署到生产（你做，第一次手动；之后 push 自动）

```bash
cd v2

# 跑 sync：生成 .wrangler/sync/*.sql 分片，再按顺序执行
pnpm sync:d1:remote

# Astro build + Pages deploy
pnpm build
wrangler pages deploy dist --project-name=management-study-v2
```

第一次跑 `wrangler pages deploy` 会自动创建 project，绑定域名 `management-study-v2.pages.dev`。

如果想自定义二级域名（比如 `v2.management-study.pages.dev`），需要在 CF Dashboard → Pages → management-study → Custom domains 加。

## 8. 之后：push = 自动部署（CI 自动做）

`v2/` 任何改动 push 到 main → `.github/workflows/deploy-v2.yml` 自动跑：
1. 装依赖
2. validate + test
3. build
4. sync D1
5. deploy Pages

约 1-2 分钟完成，**learning 加 KP 的 30 秒承诺基本能做到**（去掉 build 时间的话）。

## 故障排除

| 症状 | 排查 |
|---|---|
| `Error: D1 database not found` | wrangler.toml 里的 database_id 没填或填错 |
| `wrangler: command not found` | `pnpm install` 没跑 / 没在 v2 目录 |
| `pnpm validate` 报 cross-ref 错 | data/ 下的 JSON 引用了不存在的 KP/学派/学者 — 修对应文件 |
| Actions Deploy Worker 步骤失败 | CF token 缺权限：见根目录 README 的 token 权限清单 |
