# D1 Migrations

每个 `.sql` 是一次 schema 变更，**只 apply 一次**（D1 内部 `d1_migrations` 表跟踪状态）。

## 应用 migrations

```bash
# 远程（生产 D1）
wrangler d1 migrations apply management-study-v2

# 本地（dev 环境，astro dev + platformProxy）
wrangler d1 migrations apply management-study-v2 --local
```

## 创建新 migration

```bash
wrangler d1 migrations create management-study-v2 add_some_feature
# 创建 migrations/0002_add_some_feature.sql
```

**永远不要修改已应用的 migration**（会破坏 D1 内部状态）。要改 schema → 加新 migration。

## Schema 概览（0001）

| 表 | 用途 | 启用阶段 |
|---|---|---|
| discipline | 学科元信息 | W1 |
| school | 学派 | W1 |
| scholar | 学者 | W1 |
| kp | 知识点 | W1 |
| kp_school / kp_scholar / scholar_school | many-to-many 关联表 | W1 |
| kp_fts | FTS5 全文搜索（三语索引） | W1 |
| user / session / magic_link | 用户认证 | W2 |
| user_progress / user_note | 用户行为 | W2 |
| subscription | Stripe 订阅 | W3 |
| sync_log | 部署 audit | W1 |

## 设计要点

1. **JSON 字段最少**：`themes_json` / `tags_json` 是少数几个 JSON 列（嵌套结构 + 不需要单独查询）。其他都用关系建模。
2. **i18n 列扁平**：`title_zh / title_en / title_ja` 三列而不是 `title JSON`，方便 FTS 索引和直接 SELECT。
3. **CASCADE delete**：删一个 KP 自动删它在 kp_school / kp_scholar / kp_fts 的所有引用。
4. **position 字段**：关联表带 position 用于显示顺序，不需要单独 order 表。
5. **created_at / updated_at 全 TEXT (ISO 8601)**：和 JSON schema 一致，便于字符串比较 stale。
