# Brief for Product · 设计系统文档调研

> **状态**：Brief — **§2 部分 / §3.3 / §5 / §6 局部** 已由 **研发据代码与 `PRODUCT_HANDBOOK` 代填**；**§1 截图、§3 组件全量规格、§4、§7 细节、§8 扩充** 仍待 **产品** 补全。  
> **目的**：为 sususu 起一份**真正可作为设计源头**的文档（取代/补足现有 `STAGE-6-DESIGN-SYSTEM-SWAP-PRD.md` 的「工程 PRD」角色）。  
> **交付**：设计侧据此产出 `design-system.md` 完整版 + 各 page-level pattern 文档。

### 填写进度（一眼）

| 章节 | 状态 |
|------|------|
| §1 截图 | ⏳ 待产品（路径已约定） |
| §2 Token | ✅ 颜色见 `tokens-snapshot.css`；字体/间距摘抄 tailwind；动效见 components.css 片段 |
| §2.2 L3 表 | ✅ 经营学/市场营销已填；**「学派」不在此表**（学派 = `school` 表，非 tag 库行） |
| §3 组件 | ⏳ 待产品/设计逐组件填；§3.3 八问已答 |
| §4 Page pattern | ⏳ 待产品 |
| §5 内容/语言 | ✅ 与 `TEACHER.md` 对齐已填 |
| §6 IA | ✅ 骨架 + 权限矩阵模板（待产品勾满） |
| §7 设计债 | ⏳ 「chip 1-18」无工程文档 — 填 **TBD** 或产品复盘结论 |
| §8 不要做的事 | ✅ 先给 5 条；可再补 |
| §9–§11 | 维持原模板 |

---

## 0. 怎么填这份 brief（先读这一段，3 分钟）

（以下 **§0.1–§0.4** 维持设计师原稿，不改动。）

### 0.1 三条铁律

1. **复制模板，填空格——不要重写题干**。每节都有 fill-in 表或代码块，按格式填即可。
2. **能贴源码就别复述**。例如颜色 token 直接 `cat tokens.css >> 这里`；不要用人话解释"主色是绿色"。
3. **不知道就写"不知道 / TBD"**。空着比瞎填好。设计师看到 TBD 知道这是开放项；看到一句模糊话会以为是定论，做错方向。

### 0.2 你应该花的时间

| 段 | 预计 | 备注 |
|---|---|---|
| §1 截图 | 30-60 min | 主要是开浏览器截图存盘 |
| §2 token | 10 min | 已导出 `tokens-snapshot.css`；产品仅需核对 + 补 dark 对照说明若需 |
| §3 component | 60-90 min | 这块最费时；按模板每个组件 5-10 分钟 |
| §4-§8 | 60 min | 多数可从 `PRODUCT_HANDBOOK.md` / 本节已填段落摘抄 |
| **合计** | **约 3-4 小时** | 不要堆一天写满，分两三次写 |

### 0.3 文件放在哪

- 截图：`design/screenshots/{页面key}/{viewport}.png`，文件名规范见 §1.2
- 你的回答：**直接编辑本文件**，每节"填写区"内补内容。不要新开文件。
- token 长内容：**已放** `design/tokens-snapshot.css`（从 `v2/src/styles/tokens.css` 复制）；本文 §2.1 写引用即可。
- 不确定的开放问题：放在文末 §12 "Open Questions" 列出来

### 0.4 常见跑偏（**请避免**）

（维持设计师原稿对照表。）

---

## 1. 当前页面截图（最优先）

### 【研发 / 产品】说明

- **尚未**在仓库中提交任何 PNG；请产品按 §1.2 目录创建并 PR。
- **设计规范页**线上可截：`https://study.sususu.org/design-system`（**公开**，无需登录）。

### 1.1–1.4（维持设计师原模板）

（视口、命名、关键状态清单、页面勾选清单 —— **请产品逐项勾选并上传**。）

---

## 2. 设计 Token 实际值

### 2.1 颜色（OKLCH 完整数值）

**【已填】** 完整 L1/L2（亮/暗）及 L3 固定 tag 色见：

> **`agent/design/tokens-snapshot.css`**  
> 源文件：`v2/src/styles/tokens.css`（随部署与主仓同步；更新时请重新 `cp` 到本路径并在 PR 说明）。

要点摘要（**不等于**替代源文件）：

- **L1**：`--primary` / `--bg` / `--text` 等在 `:root` 与 `[data-mode="dark"]` 各一套；**L3 `--tag-*` 注释写明暗色不重写**（保持识别一致）。
- **L2 语义**：`--s-success` 等仅 **light 段**定义数值；dark 段主要重写 **`-soft` 底**与部分 tier/i 阶梯（见 `tokens-snapshot.css`）。

**`--link` / `--focus`**：源文件变量名为 `--link`、`--focus`（非 `--focus-ring`）；focus 环在组件里常 `box-shadow: 0 0 0 3px …` 引用 `--focus`。

### 2.2 L3 学派/分类 Tag 表（每个 discipline 一份）

**【重要澄清 · 研发】**  
`discipline.tags[]`（标签库）里的行全部是 **「知识点可挂载的分类 tag」**，**不是**学派（School）。**学派** 是独立资源：`school.key` + `title_zh`，与 KP 多对多（`kp_school`）。  
因此下表 **只列标签库**；「是否学派」列统一为 **否（分类 tag）**。学派名称请到 D1 / `data/<discipline>/schools/*.json` 查。

#### discipline: `keiei`（经营学笔记）

| key | label.zh | label.ja | label.en | hex（库内配置） | dark 专用？ | 是否学派 |
|-----|----------|------------|----------|-----------------|-------------|----------|
| t_ejbdv3 | OB | — | — | #10B981 | 否（与用户 hex） | **否** · 分类 tag |
| t_jg440q | SM | — | — | #3B82F6 | 否 | **否** |
| t_93nqjd | OT | — | — | #F59E0B | 否 | **否** |

> 注：`tokens.css` 里 L3 **OKLCH 八色**（`--tag-mgmt` 等）用于 **另一套「哈希到 token」的编辑器路径**；**页面学派卡片 accent** 优先 **用户 hex**（`resolveAccentForSchool`）。设计时需同时接受 **hex 与 OKLCH token** 两套来源 — 见 `PRODUCT_HANDBOOK` / 代码。

#### discipline: `marketing`（市场营销学）

| key | label.zh | hex | 是否学派 |
|-----|----------|-----|----------|
| t_11e78a7e | 市场洞察 | #3B82F6 | 否 |
| t_544964bf | 战略选择 | #EF4444 | 否 |
| t_5a84d584 | 价值创造 | #10B981 | 否 |
| t_5a0f53e1 | 价值传播 | #F59E0B | 否 |
| t_2b5c0fbd | 长期关系 | #8A7A6A | 否 |

#### discipline: `sociology` / 其他

- 当前 git 快照 `sociology` **tags 为空**；线上 D1 若有，请产品 **导出一份贴附录**。

### 2.3 字体

**【摘抄 `tailwind.config.ts`】**

```
font-family / 中文优先栈：
  -apple-system, BlinkMacSystemFont,
  "SF Pro Text", "SF Pro Display",
  "PingFang SC", "Hiragino Sans", "Noto Sans CJK SC",
  "Microsoft YaHei", sans-serif

font-family / 日文优先栈：
  （代码未单独设 `fontFamily.ja`；与 sans 共用 CJK fallback。若产品要「日文主字体」需另立决策。）

font-family / 英文/数字 mono：
  TBD（KP 正文代码块若有用 mono，另查 global.css / 组件）
```

**字号 scale（Tailwind extend）**：

| token | px | line-height | 用途（config 注释） |
|-------|-----|-------------|---------------------|
| xs | 11 | 1.5 | — |
| sm | 12 | 1.5 | — |
| body | 13.5 | 1.7 | 默认正文（偏小、信息密度优先） |
| base | 14 | 1.7 | — |
| lg | 16 | 1.6 | — |
| xl | 20 | 1.4 | — |
| 2xl | 24 | 1.3 | — |
| 3xl | 28 | 1.25 | — |

**字重**：`regular: 400`，`semibold: 600`（config 明示）。

### 2.4 间距

**【Tailwind 4px 网格】** `0.5→2px, 1→4px, 1.5→6px, 2→8px, 3→12px, 4→16px, 5→20px, 6→24px, 8→32px, 10→40px, 12→48px`。  
与设计师模板 `--sp-*` **命名不完全一致** — 以 **Tailwind 数字键** 为现实现状；若设计文档要统一 token 名，属 **后续重构**。

### 2.5 圆角 / 阴影 / 边框

**【tailwind.config】**  
`borderRadius`: sm 4px, DEFAULT 6px, md 8px, lg 10px, xl 12px, 2xl 16px。  
`boxShadow`: `card`, `card-hover`, `kp`（见 config 内完整 rgba 串）。

**边框默认粗细**：多组件 `1px solid var(--border)`；**hover 是否加粗** — **未全局统一**，TBD 逐组件补。

### 2.6 动效

**【摘自 `components.css` 常见值，非 exhaustive】**

- 大量 **`.12s`**（background / color / border-color）。
- **`.15s`**：部分 transform / opacity。
- **`.2s`**：shadow + transform（卡片）。
- **`max-height .35s cubic-bezier(.4,0,.2,1)`**：accordion / quad 展开。
- **`lang-toggle` pulse**：`transform .08s ease-out`。

**不允许 transition 的属性**：TBD（建议产品与研发补充：如 split-pane 拖动时禁用哪些）。

---

## 3. Component 清单 + 每个组件的状态规格

### 3.1–3.2（维持设计师模板）

⏳ 请设计/产品按模板逐组件补全。

### 3.3 关于 chip / tag / lang-toggle（本次重设计核心）— **【已填 · 研发】**

```
Q1. 学派 chip 一条 KP 最多挂几个？目前最大值是几？
    答：schema **无上限**（`kp_school` 多对多）；创建 KP 要求 **至少 1** 个学派。当前 git **未统计** max；产品可跑 D1 SQL 或填 TBD。建议产品口径：**常规 ≤3–5**，极端情况允许更多 → 设计需 **wrap**。

Q2. tag chip 一条 KP 最多挂几个？目前最大值是几？
    答：schema **无硬性上限**（`tags_json` 数组）。同上，**未统计** max；设计按 **多枚 wrap** 处理。

Q3. tag chip 真的不能点击吗？还是"暂时不能"？
    [x] **当前实现不可点**（`<span class="kp-tag-chip">`）；代码注释：**未来可链到 tag-filter 视图**，**无版本承诺**。
    [ ] 永远不点击 — **需产品最终定调**（与工程注释可冲突，以产品为准）。

Q4. 学派 chip 跳转的目标页是？
    URL 模板：`/{discipline}/{school.key}`（学派页）。
    跳转后用户最常做什么：**浏览该学派下 KP 列表 / 分栏阅读**（产品可细化）。

Q5. lang-toggle 切换会影响哪些区域？
    [x] 主标题（`title` 随 lang）
    [ ] 副标题 — **title_en 行仍展示；title_ja 在 zh 模式会显示**（见 `kp/[id].astro`）
    [x] 正文
    [x] 评价区（evaluations zh/ja）
    [x] meta 行（学者链、年份逻辑不变）
    [ ] 其他：**chip 行文案**（学派名暂 `title_zh` 不随 lang 变；**若 bug 或 feature，产品定**）

Q6. 没有日文正文时，lang-toggle 是否完全不显示？
    **Y**。无 `body_ja_json` 则不渲染 `lang-toggle` 与 **LangFab**。

Q7. KP 详情页 chip 行未来 6 个月内可能加哪些元素？
    **TBD · 产品勾选**（模板原 list 保留）。

Q8. 322px 窄屏下，chip 行如果 wrap 到 3 行还能接受吗？还是必须截断？
    **TBD · 产品**（研发建议：**wrap 优于横向滚动**，与 `FRONTEND_WORKFLOW` / 触控友好一致）。
```

---

## 4. Page-level Pattern（页面级模式）

⏳ **待产品**按模板填写（KP 详情 header、split-pane、学者 tabs 等）。

**【研发提示】** `max-width`：`tailwind` 有 `max-w-reading` 720px、`max-w-panel` 900px；KP 详情实际以页面 CSS 为准（请产品截屏 + 抄 computed）。

---

## 5. 内容/语言规则

**【已与 `agent/TEACHER.md` · Multilingual content rules 对齐】**

```
Q1. 中日双语字段在同一组件里的优先级
    主标题：**跟随用户语言**（`?lang=ja` 且存在 `title_ja` 时用日文，否则中文）。
    副标题：**title_en / title_ja` 额外行展示规则见 KP 页实现**（非简单「日主中副」）。
    元数据：**学者名链接 + year 字符串**（无 lang 切换）。

Q2. 英文术语括注的统一格式
    [x] **中文（English）** — 全角括号 `（…）`；例：观察学习（Observational Learning）

Q3. 标题截断规则
    TBD · 产品（CSS / 设计）

Q4. 数字 / 年份 / 缩写格式
    年份：**`shortYear`** — 19xx → **'77** 形式；其它格式原样或规则见 `format-year.ts`。
    人名：KP meta 用 **`lastName(name_en ?? name_zh)`** — 与「Bandura」展示一致。
    缩写（OB/SM/OT）：**标签库 label** 展示；**大写**为数据录入结果；**tooltip 展开** TBD。

Q5. 标签库 label.zh / label.ja / label.en，当前语言为日时的 fallback？
    **KP chip 展示**：代码用 **`label.zh ?? key`**（若 `label.ja` 未接 UI，属 **已知缺口**）。  
    建议产品填优先级链：**ja → zh → key → en**（需 **小开发** 才落地）。

Q6. 数字本地化
    TBD · 产品 / 现状 mostly **原样字符串**。
```

---

## 6. 信息架构总览图

**【骨架 · 产品可换手绘图】**

- **顶层**：`/login` 等公开入口 → 登录后 `/` 或 `/{discipline}`。
- **学科内**：`/{discipline}` 首页（视图 + 学派）→ `/{discipline}/{school}` → `/{discipline}/kp/{id}`；`/{discipline}/scholars`、`study-log` 等并列。
- **Layout**：多数页面共用 **Layout.astro**（顶栏 + tab）；编辑器 / admin 可能不同壳 — **产品补「共用 shell 列表」**。

**权限矩阵（示例行 · 请产品填满）**

| 控件/页面 | learner | editor | owner | super-admin |
|-----------|---------|--------|-------|-------------|
| KP 详情阅读 | ✓ | ✓ | ✓ | ✓ |
| KP 编辑按钮 | ✗ | ✓（tenant） | ✓ | ✓ |
| 学派拖拽排序 | ✗ | ✓ | ✓ | ✓ |
| Admin 用户/学科 | ✗ | ✗ | ✗ | ✓（以配置为准） |
| … |  |  |  |  |

---

## 7. 已知设计债 / 历史遗留

**【待产品 / 研发共填】**

```
A. 旧 Tailwind / 旧 CSS 残留页面：
   - TBD（可 grep `accent-ob` 等 legacy）

B. 同一 component 两套实现：
   - TBD

C. 用户/老师反馈过的视觉问题：
   1. 知识点 tab：**lang-toggle / 学派 chip / KP tag chip** 同为实心 pill，**可点性混淆**（当前在 brief 中）
   2. …

D. chip 1-18 bug 复盘「最终结论」：
   - **TBD**（仓库内无对应文档；若指 **opacity / mix** 规范，请产品从旧 PR 摘结论贴此）
```

---

## 8. 不要做的事

**【产品 / 研发初稿 · 可增删】**

```
❌ 不要给 **不可点的 tag chip** 做与 **学派链接 chip** 完全相同的 hover「抬升 + 强阴影」—— 用户会以为可导航（当前 tag 无链接）。
❌ 不要把 **lang-toggle** 的语义色降级成 **学派绿**—— lang 属于 **L1 焦点/主色链**（见 tokens 注释）；学派色来自 **标签库 hex**。
❌ 不要在 **322px** 上对 chip 行 **仅依赖横向滚动** 作为唯一方案—— **wrap + 触控目标** 优先。
❌ 不要把 **discipline.tags** 与 **school** 混称「学派」—— IA 与配色溯源会乱（见 §2.2）。
❌ 不要新增 **第 4 种无文档的 pill** 而不更新 design-system 单页 —— 先补 token / 组件规格再开发。
```

---

## 9. 提交方式

（维持设计师原稿：PR 标题 `docs(design): foundation brief for design system v1` 等。）

---

## 10. 时间预估 + 最低优先级

（维持设计师原稿：**§1 截图 + §2.1 token + §3.3 八问** 最优先；其中 §2.1 与 §3.3 **大部已填**，产品可压缩为 **§1 + 校对 §2 + 补 §3.3 Q7/Q8**。）

---

## 11. 好答案 vs 坏答案对照

（维持设计师原表。）

---

## 12. Open Questions（集中 TBD）

```
[ ] Q1. 学派 chip 在「当前语言 = ja」时，是否应显示 `title_ja`？（现实现多为 `title_zh`）
[ ] Q2. tag 的 label.ja / label.en 何时接上 UI？
[ ] Q3. chip 1-18 最终数值规范是否成文？文档链接？
[ ] Q4. 各 discipline 线上 tag 库与 git `data/*/discipline.json` 是否一致？谁 export？
```
