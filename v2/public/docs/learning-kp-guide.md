# KP 创建上传完整教程 (learning agent 必读)

> **谁该读这份文档**：所有以 git path 写 KP 的 agent — learning / 任何 worktree。
> admin UI 编辑器（`/keiei/kp/new`、`/keiei/kp/<id>/edit`）走 API 路径，自动双写 D1，
> **不需要**这份教程的 sync API 调用步骤。
>
> **公开镜像**（仓库 private 后 agent 通过 WebFetch 拉取）：
> https://study.sususu.org/docs/learning-kp-guide.md
>
> ⚠️ 编辑本文件后，记得同步：`cp v2/LEARNING_KP_GUIDE.md v2/public/docs/learning-kp-guide.md`

## 0. TL;DR — 一行流程

```
查重 → 选 format → 写 json → pnpm validate → git commit + push
                                            → curl POST /api/sync-kp-from-git → 完
```

走完最后这步，**~3s 后线上生效**。**不走最后这步要等 ~90s GitHub Actions**。

---

## 1. 路径与文件位置

| 类型 | 路径 |
|---|---|
| KP | `v2/data/<discipline>/kp/<id>.json` |
| 学派 | `v2/data/<discipline>/schools/<key>.json` |
| 学者 | `v2/data/<discipline>/scholars/<key>.json` |
| 学科 | `v2/data/<discipline>/discipline.json` |

`<discipline>` 当前已上线：`keiei`（经营学）。其它学科尚未启用。

---

## 2. KP 七步上传流程

### Step 1 — 先查重

每次新建 KP 前，先用关键词 grep 现有 KP，避免重复或与已有内容冲突：

```bash
grep -rn "双因素" v2/data/keiei/kp/
grep -rn "Herzberg" v2/data/keiei/kp/
```

如果命中 → 走"补充现有 KP"或"明确边界差异后新建"两条路径之一，详见 `Main/CONTRIBUTING.md` §8 原则 1。

### Step 2 — 选 format

选 KP body 用什么格式 — 直接决定阅读体验。**5 种 format**：

| format | 适用场景 | 视觉特征 |
|---|---|---|
| **narrative** | 连续叙事的概念解释（如双因素理论的来由 + 论证） | 一段文字，`<strong>` 加粗关键词 |
| **flat-list** | 并列要点（如七种浪费、五力模型的 5 力） | `◆name——desc` 一行一项 |
| **accordion** | 多组多要点（如 3 种组织结构 × 各 3 个特点） | `【组名】<br>①...<br>②...` 折叠分组 |
| **compare** | 多对象横向对比（如 Maslow vs Herzberg vs McClelland） | 翻面对比卡，每张卡 6 字段 |
| **quad** | 二维矩阵（如 BCG、SWOT） | 2×2 象限，每格名称+图标+描述 |

**怎么选？** —— 信息结构是什么样，format 就选什么。如果同一 KP 信息既能写 narrative 也能写 flat-list，**优先选结构化的**（更易复习记忆）。

每种 format 都有完整 example：`v2/data/keiei/kp/_template.<format>.json`，直接 copy 改。

### Step 3 — 写 KP JSON

**模板路径**（按你选的 format）：
- `v2/data/keiei/kp/_template.narrative.json`
- `v2/data/keiei/kp/_template.flat-list.json`
- `v2/data/keiei/kp/_template.accordion.json`
- `v2/data/keiei/kp/_template.compare.json`
- `v2/data/keiei/kp/_template.quad.json`

**关键字段**：

| 字段 | 必填 | 说明 |
|---|---|---|
| `id` | ✓ | `k` + 数字（如 `k628`），全 discipline 内唯一。下一个数字 = `ls v2/data/keiei/kp/k*.json \| sort -V \| tail` 的下一个 |
| `discipline` | ✓ | `keiei`（暂无其它） |
| `schools` | ✓ | 至少 1 个，必须 ∈ `v2/data/keiei/schools/*.json` 的 key |
| `scholars` | — | 可空，但有学者 KP 几乎都该填；必须 ∈ `v2/data/keiei/scholars/*.json` 的 key |
| `year` | ✓ | 字符串如 `"1959"`、`"1980s"`、`""` 都行 |
| `title.zh` | ✓ | 中文标题 |
| `title.en` / `title.ja` | — | 可选，但建议都填（搜索体验） |
| `body.zh` | ✓ | 中文正文，结构跟 format 匹配（见 §3） |
| `body.ja` | — | 可空但**强烈建议同步翻译**（站点是中日双语） |
| `format` | ✓ | `narrative` / `flat-list` / `accordion` / `compare` / `quad` |
| `tags` | — | 颜色标签数组，引用 discipline.tags[].key（先空着，admin UI 后续可调） |
| `evalContent.zh.{义,限,例,应,用,喻}` | — | 评价标签结构化字段（见 §4） |
| `createdAt` / `updatedAt` | ✓ | ISO timestamp，新建时两者相同；`new Date().toISOString()` |

### Step 4 — 本地 schema 校验

```bash
cd v2 && pnpm validate
```

会跑 zod schema + cross-ref 校验。常见报错：
- `KP kXXX references missing school "yyy"` — schools[] 里的 key 不在 schools/ 目录
- `KP kXXX references missing scholar "yyy"` — 同上 scholars
- `themeKey "..." not in discipline.themes[]` — 学派文件 themeKey 字段没在 discipline.themes 里
- zod field error — JSON 字段类型 / required 不对

**校验过不了不要 push**，CI 会拒绝部署。

### Step 5 — Git commit + push

```bash
git add v2/data/keiei/kp/k628.json
git commit -m "v2: add k628 组织开发 OD by learning agent"
git push origin main
```

⚠️ **不要 amend 已 push 的 commit**。如果发现错了，再 commit 一次修复。

### Step 6 — 调 sync API（重要！让 ~3s 生效）

```bash
curl -X POST \
  -H "Cookie: <你的 admin session cookie>" \
  https://management-study-v2.pages.dev/api/sync-kp-from-git/keiei/k628
```

**返回 payload**（成功）：
```json
{
  "ok": true,
  "kp_id": "k628",
  "discipline": "keiei",
  "title_zh": "组织开发（OD）",
  "commit_sha": "abc123...",
  "d1_synced_at": "2026-04-28T10:38:00.000Z",
  "public_url": "https://management-study-v2.pages.dev/keiei/kp/k628"
}
```

**没调这步会怎样？** — KP 写到了 git，但 D1 还是老的，前端访问看到老数据。要等 GitHub Actions 跑完整 sync（~90s）才生效。

**调用前提**：当前 session 是 admin（`husuli0623@gmail.com` 登录后的 cookie）。如果你 agent 不知道 cookie，让用户在浏览器跑 `document.cookie` 复制给你。

### Step 7 — 浏览器验证

访问 `public_url`（payload 返回的）。看到新 KP = 成功。

如果用户当前正打开站点的某页，**v0.5.92 起**会自动 polling 检测到 sync_log 更新 → 弹 toast「站点内容已更新，点这里刷新」。

---

## 3. 5 种 format 的 body 字符串结构

**评价段** `◆意义——XX◆局限——YY` 在所有 format（除 narrative 外）都可作独立段，写在 body 末尾。也可写到 `evalContent.zh.{义,限,...}` 结构化字段（推荐，更干净）。

### 3.1 narrative（自由叙事）

```
<strong>关键词</strong>——一句话定义。详细解释...<strong>另一关键词</strong>——展开。
```

只用 `<strong>`、`<em>`、`<br>` 三个 HTML 标签。其它一律不用。

参考 `_template.narrative.json` (双因素理论 example)。

### 3.2 flat-list（并列要点）

```
导语：◆name1——desc1◆name2——desc2◆name3——desc3
```

- 导语后面加 `：` 才能让前端正确分离 lead 和 items
- `◆name——desc` 是单条，name 简短、desc 一句话
- 评价段写法：直接续在最后 `◆意义——XX◆局限——YY`

参考 `_template.flat-list.json` (七种浪费 example)。

### 3.3 accordion（折叠分组）

```
导语：<br>【组1标题】<br>①name1——desc1<br>②name2——desc2<br>【组2标题】<br>①...
```

- `<br>` 强制存在 — accordion parser 靠它分段
- `①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮` 圆圈数字（编辑器自动加，手写也用这套）
- 一组下要点之间 `<br>` 分隔
- 组与组之间 `<br>【新组】<br>` 切换

参考 `_template.accordion.json` (组织结构演化 example)。

### 3.4 compare（对比卡片）

```
导语：<compare>title1|keyword1|desc1|type1|theories1|detail1||title2|...</compare>
```

- 单卡 6 字段：`title|keyword|desc|type|theories|detail`
- 卡之间用 `||`（双竖线）分隔
- `detail` 是翻面后显示的详细信息
- `theories` 一般写 `Author 'YY` 格式

参考 `_template.compare.json` (内容理论三大流派对比 example)。

### 3.5 quad（四象限）

```
导语：<quad>yAxis,xAxis||name1|emoji1|sub1|detail1||name2|emoji2|sub2|detail2||...</quad>
```

- 第一段是轴：`yAxis,xAxis`（用英文逗号分隔）
- 然后 4 个 cell（左上 / 右上 / 左下 / 右下顺序）
- 每个 cell 4 字段：`name|emoji|sub|detail`

参考 `_template.quad.json` (BCG 矩阵 example)。

---

## 4. 评价段：◆ 段 vs evalContent 字段

KP 评价（义/限/例/应/用/喻）有**两种写法**，二选一：

### 写法 A — body 内嵌 ◆ 段

```json
"body": {
  "zh": "...正文...◆意义——XX◆局限——YY",
  "ja": "...本文...◆意義——XX◆限界——YY"
}
```

兼容老数据，可读性差但简洁。

### 写法 B — evalContent 结构化字段（推荐）

```json
"body": { "zh": "...仅正文，不带 ◆", "ja": "..." },
"evalContent": {
  "zh": {
    "义": "意义内容...",
    "限": "局限内容...",
    "例": "案例（可选）",
    "应": "应对（可选）",
    "用": "应用（可选）",
    "喻": "比喻（可选）"
  },
  "ja": {
    "義": "意義内容...",
    "限": "限界内容..."
  }
}
```

**注意**：日语 key 用日语汉字 `義 / 限 / 例 / 応 / 用 / 喩`，不是中文 `义 / 限 / ...`。

写法 B 让前端 evalContent 区独立渲染，视觉清晰。**新建 KP 优先用写法 B**。

---

## 5. 注意事项 / 常见错误

### 5.1 中日同步是硬要求
- `body.zh` 改了，必须同时改 `body.ja`
- 日语版必须用**学术标准术语**而非直译（参考 `Main/CONTRIBUTING.md` §2 已知术语对照）
- 日语 evalContent key 用日语汉字（`義 / 限 / 例 / 応 / 用 / 喩`）

### 5.2 schools / scholars 必须存在
- schools[] ≥ 1
- 写之前 `ls v2/data/keiei/schools/` 查 key
- scholars 同样

### 5.3 format 与 body 必须匹配
- format='narrative' 但 body 写了 `<compare>...` → 前端按 narrative 渲染 = 显示原始 HTML
- 改 format 时 body 要同步重写

### 5.4 sync API 调用前提
- 必须有 admin session cookie（`husuli0623@gmail.com` 登录后）
- 必须先 git push（API 从 GitHub Contents API 拉文件）
- 如果 push 后立刻调 API 偶发拉到老版本 → API 自带 retry 2 次（每次 backoff 500ms / 1s），通常自愈

### 5.5 不要走老路径
- ❌ 直接编 `v2/data/.../json` + 等 90s GH Actions sync
- ❌ 修改 `Main/data.js` / `Main/data_ja.js`（v1 已停用）
- ❌ 写 `<br><br>双因素理论` 这种 v1 风的 fenced 标签包装

---

## 6. 跨 discipline 推 KP

学科 `<discipline>` 现只有 `keiei`，但 API 设计支持任意学科：

```bash
curl -X POST \
  -H "Cookie: <session>" \
  https://management-study-v2.pages.dev/api/sync-kp-from-git/<discipline>/<id>
```

新增学科时：
1. `v2/data/<new-discipline>/discipline.json`
2. `v2/data/<new-discipline>/{schools,scholars,kp}/` 三个目录
3. KP 文件遵循同样的 schema
4. 调用同一个 API endpoint 即可，无需改代码

权限：admin 默认对所有学科有 canEdit；普通用户的 per-discipline RBAC 见 `feedback_worktree_scope` memory。

---

## 7. 真值参照

| 文档 | 用途 |
|---|---|
| `Main/CONTRIBUTING.md` §3 §4 §8 | KP 三层架构、日文学术对照、KP 生成 6 原则（背景） |
| `Main/CLAUDE.md` | 项目核心规则 + 部署规范 |
| `v2/src/schemas/kp.ts` | KP zod schema 真源（字段定义） |
| `v2/src/lib/body-parser.ts` | 5 种 format 的 body string 解析逻辑（debug 时看） |
| `v2/data/keiei/kp/_template.*.json` | 5 种 format 各一个 example，copy 起手 |

---

## 8. 给主 user 的反馈话术（成功/失败）

agent 调 sync API 后，把结果**清晰**汇报给用户，比如：

成功：
```
✓ k628「组织开发（OD）」已 push 上线
  commit: abc123 · D1 synced 10:38:00
  浏览：https://management-study-v2.pages.dev/keiei/kp/k628
```

失败（某个步骤出错）：
```
✗ k628 push 失败 — schema 校验未过：scholars[0] "beckhrd" 不在 scholars 目录（拼写错？应为 "beckhard"）
```

不要含糊地说"已上传完成"，让用户能清楚 push 是否真生效 + 哪里失败。
