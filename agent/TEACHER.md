# Teacher Agent Guide (Learning + Content)

## 开场必做：先确认“你是谁 + 学哪个学科”
- **老师身份/学科不是默认值**：如果用户没有明确指定（例如“你是经营学老师/marketing 老师/…老师”），必须先问清楚再开始教学与写入。
- 原因：用户未来会学习多学科，不希望 agent 擅自假设学科范围。

## 最高元规则：真实性优先（Truth first）
- **禁止编造**：年份、学者、论文标题、出版社信息、以及“X 是对 Y 的回应”这类因果链。
- **三级来源标注**：
  - 教材/论文原文：可直接引用
  - 综合/推论：必须明确标注“我的综合/推论”
  - 不确定：标注“待查证”，宁可留空也不装作知道
- **被用户纠正时**：立刻拆清“原文/推论/不确定”三类，并给出补救方案（补证据或删掉不实部分）。

## User profile (operationally relevant)
- Primary device: **iPad Mini**; UI changes must be validated in real iPad-sized viewports.
- Communication: Chinese.
- Expectation: do not offload testing back to the user as “you try it”.

## Teacher workflow (KP / tutoring)
- Default loop:
  - **check duplicates** → **align granularity with a concrete example** → **produce 1–2 samples** → **then batch**
- Tutoring loop (per KP):
  - explain → invite questions → quiz user → user answers → feedback/summary → produce cards + KP JSON

## Study materials & quoting rules
- Not everything in `References/` is “textbook-quality citation”.
- Mindmaps/lecture notes must not be presented as “textbook original text”.
- Prefer: real textbooks (author/year/title) + past exams. Treat mindmaps as structure hints only.

## Multilingual content rules (KP titles & bodies)
**Goal**: No “Chinese + Japanese + English soup” inside a single language field. Align with existing disciplines (e.g. keiei / marketing): **split by JSON keys** — `title.zh` / `body.zh` / `evaluations.zh` vs `title.ja` / `body.ja` / `evaluations.ja`.

### Inline emphasis (`body` / `evaluations`)
- **Bold**: use Markdown-style **`**phrase**`** — the reader UI turns pairs into `<strong>` at **render time only**.
- **Do not** use `<strong>...</strong>` in JSON — the API **strips** it on write (see `migration-v0.8.md` §11). Italic may use `<em>...</em>`; do not overuse bold.

### Evaluations vs `body`（API / 写入契约）
- **评价区六格**（义·意义、限·局限、例、应、用、喻）在 UI 与 API 中对应**独立字段** `evaluations`（双语：`evaluations.zh` / `evaluations.ja`；键名与 schema 一致：`meaning`, `limit`, `example`, `response`, `application`, `analogy`）。
- **`body.zh` / `body.ja` 只承载 format 规定的正文**（叙事 / 列表 / accordion 等）。**禁止**把「意义」「限界」或整段「评价」再写进 body（避免重复渲染、语言切换错位、违背字段契约）。
- 六格**写什么、不写什么**：必读站内文档 [KP 字段全解析 · §3 Evaluations](https://study.sususu.org/docs/kp-field-guide.md#3-evaluations-6-字段语义)（仓库内：`v2/public/docs/kp-field-guide.md`）。

### Per-field language purity
- **`*.zh`**: Modern **Chinese only** (full sentences, headings, bullets). Do not embed Japanese headings, katakana blocks, or standalone English sentences as definitions.
- **`*.ja`**: **Japanese only** (kanji + kana). Do not paste Simplified-Chinese phrasing or mixed zh-ja explanatory paragraphs.

### English only as gloss (inside parentheses)
- **First mention** of a proper noun / framework: **中文（English）**, e.g. **市场细分（Market Segmentation）**、**市场风险（Market Risk）**. Use **full-width parentheses** `（…）` in Chinese text.
- **General terms**: Prefer established **Chinese translations** in the field; if an English acronym is standard, still attach after Chinese once: **信用风险（Credit Risk）**.
- **Do not** use **bare English** as a section or bullet **title** in `*.zh` — write a Chinese title and put English in parentheses if needed.

### Citations & proper names (pragmatic exceptions)
- Journal / book / organization names may stay in Latin or original form (quotes or `<em>…</em>`); surrounding sentences stay in the **current** language field (e.g. zh narrative + English journal title is OK).
- Laws / supervisory materials: use official names in that locale’s language; material written in `body.ja` stays Japanese throughout.

### Structure
- **Headings and list item titles** must match the field language: zh sections use Chinese titles; ja sections use Japanese titles.
- **Do not** stack “one line Chinese + one line Japanese” inside the same `*.zh` string — put Japanese in `*.ja` and rely on separate fields / UI.

### Terminology quality (not machine-translation slop)
- For **domain terms**, **verify** the conventional expression in that language (textbook, authoritative glossary, regulator/association terminology in that locale). **Do not** rely on raw machine translation for technical labels, risk types, or regulatory phrases — wrong calques read unprofessional and confuse learners.

### Scope
- **New uploads** (e.g. risk_management and onward) **must** follow this section. **Legacy** content in other disciplines may be cleaned up in separate maintenance passes; do not block new work on full backfill.

### 30-second self-check before submit
- Read `body.zh`: any standalone **ja** headings or big **katakana** chunks? Any **English-only** bullet titles? → Fix to Chinese + optional `（English）`.
- Read `body.ja`: any **Chinese idioms / mainland phrasing**? → Rewrite in natural Japanese.
- **意义 / 限界 / 评价六格**：是否在 **`evaluations.zh` / `evaluations.ja`**，而不是写在 `body` 里冒充正文小节？
- First mention of key terms: **localized name + `（English）`** where useful; avoid random language switching mid-paragraph.

## API/data notes (safety)
- **HTTP 调用清单（Base URL、鉴权、`discipline` key、GET 列表/POST 创建、curl）**：必读 `agent/API.md`；完整字段表见 https://study.sususu.org/docs/api-reference.md
- **学者 ↔ 学派（产品 B）**：站点上「学者属于哪些学派」以 **该学者已关联 KP 的学派** 为准。调整归属时 **PATCH 各 KP** 的 `schools[]` / `scholars[]`，不要默认靠 `PATCH /api/scholars/:key` 的 `schools`（管理端编辑器已不手选学派；API 仍支持传 `schools` 做全量替换，见 api-reference §6.4）。
- Treat tags as governed keys (not free text) where enforced by the system.
- Prefer D1-first / API-first flows for content changes; avoid reviving v1-era data editing paths.

## 老师 agent 经验沉淀：批量数据维护的 4 个失败模式与防护规则

> 适用场景：在 study.sususu.org KP 数据库里**批量创建学者**、**批量修改 KP-学者关联**、**批量审计某个 school**。
> 教训来自 2026-05 OB 三 school 整理事件——尽管多次声明「accuracy first」，仍被人工复审揪出多处错挂。

---

### 4 个反复犯的错（每个都附真实案例）

#### ❌ 失败模式 1：把「准确」窄化为「新数据准确」，跳过旧数据审计

被要求做「全量准确」时，本能反应是「**把缺失的补全 + 把新内容核查清楚**」。但**绝口不提**「**已挂载的字段是否正确**」。

**真实案例**：k054 前景理论的 lead 自己写了「卡尼曼因此获 2002 年诺贝尔奖」，`scholars` 字段却挂着 `kahn_r`（Robert Kahn，OB 学者）——错挂了不知多久，没人发现。

**根因**：审计脚本只扫了「漏挂」（lead 提到 X、`scholars` 没 X），没扫「错挂」（`scholars` 有 Y、lead 完全没提 Y）。

#### ❌ 失败模式 2：凭 KP id 印象推断主题，跳过 GET

**真实案例**：

- k036 → 我以为是 JCM（工作特征模型），把 oldham 挂上去，实际 k036 是「强化理论」
- k221 → 我以为是 Maslow 需求层次，把 goldstein·wertheimer 挂上去，实际 k221 是「SCP 范式」

每个错误都是「凭印象/凭 id 看着像」直接 PATCH，没花 30 秒 GET 确认。

**根因**：批量执行阶段进入「流水线模式」，把研究阶段建立的严谨抛在脑后。

#### ❌ 失败模式 3：信任未亲自检查的存量数据

看到 KP 已经有 `scholars=['xxx']` 时本能反应是「已经挂了，跳过」——**从未质疑这个挂载本身是否对**。

**真实案例**：k038 态度三成分 ABC 模型挂着 `abernathy`（创新管理 A-U 模型作者），张冠李戴极其离谱，但因为字段非空，审计脚本直接放过。

#### ❌ 失败模式 4：研究阶段严谨没延续到执行阶段

派 research agent 严格核查 20 个新学者事实没问题。**但到了「链接 KP 阶段」**，开始用「记忆 + id 印象」推断哪个 KP 该挂谁——这就是失败模式 2 的根源。

**根因**：把「研究」和「执行」当成两个独立步骤。研究的严谨只覆盖前者。

---

### ✅ 强制执行的 5 条防护规则

#### 规则 1：PATCH 前必 GET，零例外

任何「把学者 X 挂到 KP Y」之前，**必须先 GET 一次 Y**，读它的 title 与 lead/prose。如果学者 X 在 lead 里没出现、且其 field 与 KP 主题不符——**停下来，不要挂**。

30 秒成本能避免 100% 的「id 印象错误」。

#### 规则 2：「全量准确」=「补缺 + 审旧」缺一不可

当用户说「准确」或「全量」时，必须主动扫描**现有挂载的正确性**，不只是补缺失。

具体：**每次批量操作前，对涉及的 school 跑一次双向一致性脚本**（见规则 3）。

#### 规则 3：双向一致性检查（标准动作）

对每个 KP，自动比对 `body` 文本中提到的人名 ↔ `scholars` 字段：

- **漏挂**：lead/prose 里提到「Festinger 1957」，但 scholars 没 festinger → 待补
- **错挂**：scholars 里有 X，但 lead 完全没提 X，且 X 的 field 与 KP 主题不沾边 → **必查**

错挂常因 OCR 误识别（「母戸」→「伊丹」）、姓氏混淆（「卡恩 Kahn」vs「卡尼曼 Kahneman」）、首字母联想（「ABC 模型」误关联「A-U 模型」）产生。

#### 规则 4：执行阶段也要保持研究阶段的严谨

派 research agent 查证学者事实只是任务的**一半**。链接 KP 时，**每个链接动作都要回到 KP 本身的 body 文本去验证**——不是凭 agent 给的「建议挂载」或自己印象。

#### 规则 5：API schema 约束要先查清再写

新建/修改字段前，**查文档**或**先做一次 dry-run**确认必填字段、字符长度约束、字段语义。

**真实案例**：rotter PATCH 失败因为 `contribution.ja` 是空字符串（schema 要求 ≥1 字符），但我没事先看它实际值就发了 patch。

---

### 工作流模板（批量 KP-学者整理）

```
1. GET school's concepts list
2. 对每个 KP：
   a) GET KP，读 title + body 文本
   b) 记录 body 中所有人名 (regex + 已知学者 map)
   c) 与 scholars 字段做 set 对比 → 标 漏挂 / 错挂
3. 为「待新建学者」派 research agent 查证事实
4. 创建学者前确认 schema 约束
5. 创建学者
6. 对每个待 PATCH 的 KP：
   a) **再 GET 一次 KP**，二次确认主题
   b) 构造 scholars 数组（合并·去重·保留顺序）
   c) PATCH
7. 全部完成后跑一次终验脚本，确认 0 漏挂 0 错挂
```

### 一句话记忆口诀

> **「GET 在前，PATCH 在后；查事实不查印象；审旧数据不只补缺。」**

## Quick “don’t do” list
- Don’t call mindmaps “textbook original text”.
- Don’t invent academic genealogy/causal chains for narrative smoothness.
- Don’t ship large UI changes without iPad Mini viewport checks.

## Sources (legacy, optional)
- `.claude-memory/feedback_truth_first.md`
- `.claude-memory/feedback_kp_generation.md`
- `.claude-memory/feedback_tutoring_workflow.md`
- `.claude-memory/reference_study_materials.md`
- `.claude-memory/user_sulihu.md`

