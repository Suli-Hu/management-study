# HTTP API 速查（老师 Agent / 外部脚本）

> **用途**：冷启动后若要 **查列表 / 查重 / 创建** 知识点与组织结构，先读本节。完整字段表与边界情况见线上全文档（不依赖私有仓库）。
>
> **完整参考（真源镜像，随部署更新）**：  
> https://study.sususu.org/docs/api-reference.md

## 1. Base URL

```
生产：https://study.sususu.org
备用：https://management-study-v2.pages.dev
```

以下示例用 `BASE=https://study.sususu.org`，调用时替换即可。

## 2. 鉴权

- **Header**：`Authorization: Bearer <token>`
- **Token 形态**：`ms_v1_` + 32 位十六进制（创建时页面一次性展示；丢失只能作废重建）。
- **获取**：浏览器登录后打开 `/admin/tokens` 创建；可按学科收窄 scope。
- **自检**：`GET /api/me`（确认 token 可用、可见学科列表与角色）。
- **不要把真实 token 写进 Git**；在对话里由用户提供或读环境变量。

## 3. 学科怎么传？（最重要）

API 使用的是 **学科 key（英文短码 slug）**，**不是** 界面上的中文名（例如「保险学」「经营学」）。

| 方式 | 示例 |
|------|------|
| Query | `?discipline=keiei` |
| Header | `x-discipline-key: keiei` |

**没有** `subject` 这类参数名；统一叫 **`discipline`**（值为 key）。

**如何从「中文名」得到 key？**

1. 调 `GET /api/me`，在 `disciplines[]` 里找 `title.zh`（或 `title.en`）匹配的项，使用其 **`key`**。
2. 或先问用户：「本对话的学科 key 是什么？」（用户冷启动时应明确学科）。

## 4. 列表 / 查重（GET）

在对应学科下拉列表；用 `q` 做关键词过滤，减少重复创建。

| 层级 | 说明 | Endpoint |
|------|------|----------|
| 学派组（Theme） | 学派分组 | `GET /api/themes?discipline=<key>` |
| 学派（School） | 含 `q`、`theme` | `GET /api/schools?discipline=<key>&q=...` |
| 学者（Scholar） | 含 `q`、`school` | `GET /api/scholars?discipline=<key>&q=...` |
| 知识点（KP） | 含 `q`、`school`、`scholar` | `GET /api/kps?discipline=<key>&q=...` |

**一次拉全库结构（推荐开局调用）**：

- `GET /api/metadata?discipline=<key>` — 字典级 themes / schools / scholars / tags / views / formats。
- `GET /api/v1/index/<key>` — 学科 manifest（themes、schools、scholars、kps 全景，适合防重复与核对 key 拼写）。需 `canRead`。

## 5. 创建（POST）

| 资源 | Endpoint | 备注 |
|------|----------|------|
| KP | `POST /api/kps?discipline=<key>` | Body 勿手写 `tenant_id` / `discipline`（服务端注入） |
| 学派 | `POST /api/schools?discipline=<key>` | `themeKey` 须属于该学科 |
| 学者 | `POST /api/scholars?discipline=<key>` | `schools` / `kpsOrder` 须为同学科 key |
| 学派组（Theme） | `POST /api/new/theme` | **形状特殊**，见下节 |

### 5.1 学派组创建（与 REST 不同）

`POST /api/new/theme` 的 JSON body **不是** 扁平字段，而是：

```json
{
  "discipline": "keiei",
  "json": {
    "title": { "zh": "示例组", "en": "Example Group" },
    "desc": { "zh": "可选说明" }
  }
}
```

`key` 可省略，服务端会生成；显式传 `key` 时不要与已有重复。

## 6. 可直接复制的 curl 样例

把 `YOUR_TOKEN`、`DISCIPLINE_KEY` 换成实际值。

```bash
export BASE=https://study.sususu.org
export MS_TOKEN='YOUR_TOKEN'
export DISCIPLINE_KEY='keiei'

# 身份与可见学科（从响应里确认 key，不要用中文名当 path）
curl -sS "$BASE/api/me" -H "Authorization: Bearer $MS_TOKEN" | jq .

# 元数据（写 KP 前拿 schools/scholars/themes/tags）
curl -sS "$BASE/api/metadata?discipline=$DISCIPLINE_KEY" \
  -H "Authorization: Bearer $MS_TOKEN" | jq .

# 列表 + 查重关键词
curl -sS "$BASE/api/kps?discipline=$DISCIPLINE_KEY&q=风险&limit=20" \
  -H "Authorization: Bearer $MS_TOKEN" | jq .
curl -sS "$BASE/api/schools?discipline=$DISCIPLINE_KEY&q=市场" \
  -H "Authorization: Bearer $MS_TOKEN" | jq .
curl -sS "$BASE/api/scholars?discipline=$DISCIPLINE_KEY&q=科特勒" \
  -H "Authorization: Bearer $MS_TOKEN" | jq .
curl -sS "$BASE/api/themes?discipline=$DISCIPLINE_KEY" \
  -H "Authorization: Bearer $MS_TOKEN" | jq .

# 创建 KP（最小字段示意；完整必填项见 api-reference §4）
curl -sS -X POST "$BASE/api/kps?discipline=$DISCIPLINE_KEY" \
  -H "Authorization: Bearer $MS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "k999",
    "title": { "zh": "示例标题", "en": "Example" },
    "body": { "zh": "示例正文" },
    "format": "narrative",
    "year": "",
    "schools": ["motivation"],
    "scholars": [],
    "tags": []
  }'
```

## 7. 与 `TEACHER.md` 的关系

- **教学原则、查重流程、真实性**：见 `agent/TEACHER.md`。
- **具体 URL、参数名、鉴权**：以 **本节 + `api-reference.md`** 为准。

## 8. 常见卡点

- 用中文学科名当 `discipline=` → **400/403**。先 `/api/me` 或问用户要 **key**。
- `tags` 在写入侧多为 **标签库 key**（如 `t_xxx`），不要随意造自由文本；先 `GET /api/metadata` 看 `tags[]`。
- Theme 创建走 `POST /api/new/theme` + `{ discipline, json }`，不要假设与 `POST /api/schools` 同形。
