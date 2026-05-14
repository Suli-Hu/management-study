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

### Unit 切换 review 习惯（Unit N → Unit N+1 不可跳过）

每次进入下一 Unit 前必须先 review 上一 Unit，哪怕用户催“直接开始”。可以压缩，但不可省略。

- **最小版（≤100 字）**：做了什么 / 没做什么 / 本轮遗留（纯度残留、空内容 KP、漏挂学者）/ 下个 Unit 的前置条件是否满足
- **标准版流程**：
  - 读取学习计划 / memory
  - 盘点 Unit N 完成情况与副产物
  - 列出发现项（问题清单）
  - 检查 Unit N+1 前置条件
  - 如需调整路线图，给出调整建议，再进入正文教学

### KP「学前补 + 学后润」闭环（每 Unit 都要做）

- **学前自动审查（开讲前）**：拉取本 Unit 涉及 KP，做一次性盘点并让用户决策再批量修补：
  - 内容厚度：narrative < 200 字 / flat-list < 3 items / accordion < 2 groups / lead 为空 → 偏薄
  - 学术错误：学者归属、年份、命题、关键术语
  - 术语过时：日文术语是否为学界标准写法；是否已有后续修正（避免陈旧教材叙事）
  - 纯度：zh 混入日文（片假名 ≥3 / 平假名 ≥2）视为违反
- **学后回流润色（Unit 结束 / 切换前 review 环节）**：
  - 抽取本轮对话中的高质量解释片段（对比表、因果链、好问题与好回答）
  - 找到 KP 的对应落点（常在 `evaluations.*` 或 `body.lead`）
  - 口语 → KP 风格：保留因果叙事，避免“标签 + 短解释”
  - demo 预览 → 用户确认 → PATCH → 纯度验证

### fact-check 反射弧（看到关键词就自动进入核查模式）

**触发词**（出现就要警惕并核查）：
- “开创 / 奠基 / 首创 / 唯一”
- 任何 “X 提出 Y” 的归功表述
- 具体著作年份（尤其多版次书籍的“第一版 vs 增订版”）
- “X 直接继承 Y” 的谱系表述

**触发后必查**：
- method 起源 vs 在本领域首次应用 vs 后续继承改进（不要混成同一件事）
- 第一版年份 vs 后期增订版年份
- 术语来源：教科书简化叙事 vs 严格学术起源

### 出题原则（日本院校升学向）

- **每题 4 选项**，正确答案分布尽量均匀（避免连续都选 A / B）
- **每个选项都写解析**：错选项也是知识点（不只解释正确答案）
- **题型混合**：反向题（“不是/错误的是”）+ 时序/配对/多选穿插
- **多选答题格式**：用 `3.ABC`

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
- **列表 API 默认只返回一页**：`GET /api/kps` / `schools` / `scholars` 默认 `limit=50`、单页最大 `limit=200`；**必须**看响应里的 `page.total` 与 `page.next_offset`，**翻页直到 `next_offset` 为 `null`**（或显式 `limit=200` 后仍检查是否还有下一页），否则「全量清单」会系统性缺条。细则见 `agent/API.md`「列表分页」。
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

**与前文的关系**：上一层覆盖 **批量关联 / 避免错挂**；下文覆盖 **KP 正文与结构打磨**。

---

## 老师 agent 经验沉淀（续）：KP 内容打磨的 13 条规则

> 适用场景：写或改 KP 的 body / accordion / flat-list 时的内容打磨。
> 教训来自 2026-05「人性假设」KP 改稿对比——用户改后的版本明显更紧凑、专注、可读，复盘出可复用的风格规则。
> **规则 11–13**（核心命题 + 因果叙事）：用户 2026-05 反馈累积，**Unit 3 起**对重要 KP 严格执行。

---

### 规则 1：item 标题不写 ①②③ 编号，desc 不写 KP id 内联引用

**编号**：accordion 在前端会自然渲染列表序号，作者再手写 ①②③ 就重复了。

**KP id**：写「（详见 k021 X 理论）」破坏阅读流——学生不会去查 id。直接说「（详见 X 理论与 Y 理论）」就够了，前端可以做软链接。

**反例**：「① 経济人」→ 「上述 ①②③ 三种假设的集大成」→ 「批判 ① 経济人」（layered 编号引用）

**正例**：「経济人」→「上述三种假设的集大成」→「首尾呼应：経济人」

### 规则 2：解释概念时要写**「为什么」**而不只是**「是什么」**

光贴标签学生记不住，要写出概念背后的**机制/约束/原因**。

**反例**：「人不是「无限理性」而是有限理性（Bounded Rationality）」——只贴了标签

**正例**：「**人受到认知能力·信息收集·时间的制约**，不是「无限理性」而是有限理性」——三大约束写出来，学生答题时能展开

### 规则 3：用**学科本身的语言**精确化对立概念

写经济学概念用经济学术语、写统计概念用统计术语——不要用日常表达稀释学科精度。

**反例**：「不追求最优化，而是满意化——找到「足够好」的方案就停止搜索」

**正例**：「不追求**最大边际收益的**最优化（optimization），而是**追求最低能够满足自己要求的**满意化（satisficing）结果」——把「最优 vs 满意」翻译成「最大边际收益 vs 最低满足要求」

### 规则 4：中文 KP 用**简体字统一**，避免 OCR/输入残留的日式汉字

「経济人」（経 是日本汉字）应该写「经济人」（经 是简体）。**例外**：日本式管理特有术语保留日式汉字，如「経営学」「経営人」「経営管理」——这是固定术语而非误用。

检查清单：経 / 関 / 単 / 売 / 価 / 学 / 国 / 会 等日式汉字若出现在 zh 文本中，多数应换简体；除非是术语固定写法。

---

### ⚠️ 编辑安全规则（重要）

#### 规则 5：`evaluations` 字段在大改时极易丢失，要主动保护

老师手动编辑 KP body（特别是改 accordion 结构）时，`evaluations.zh` 经常被前端编辑器**整段抹掉**（API v0.8 规定 body 的 PATCH 是该语种全量替换，但 evaluations 是独立顶层字段，本不应受影响——但前端某些重写流程会一起清空）。

**作为 agent 的应对**：每次 PATCH KP body 时，**主动 GET 现状的 evaluations**，**带在 PATCH payload 里**作为兜底；如果发现 `evaluations.zh` 已为空，**主动询问老师是否需要补回**。

#### 规则 6：发现疑似笔误**先报告再决定**，不要擅自改

例如「把效用窄化为经济的汇报」——「汇报」明显是「回报」的笔误。

**作为 agent**：直接修正可能改掉老师有意为之的非常规表达。**应该单独标出来等老师确认**——「我注意到这里写了「汇报」，是否应为「回报」？」

*（例：「汇报→回报」若老师已自行修正 DB，agent 仅遵循本规则记录经验、不擅自回写。）*

#### 规则 7：不要把「个体/群体/组织层面」当成写作模板硬塞

「个体 / 群体 / 组织」三层框架是 **OB 的分析工具**，用于分类因素；它**不是 lead 的写作模板**。当 lead 里列举塑造某个概念的因素时，**直接列出实质因素即可**，不要刻意写成「**个体层面**的 X · **群体层面**的 Y · **组织层面**的 Z」这种层级前缀堆叠。

**反例**（视觉噪音、刻意分层）：

> **个体层面**的归因风格·**群体层面**的群际归因偏差·**组织层面**的反馈方式共同塑造归因模式

**正例**（直接、清爽）：

> 归因风格·群际归因偏差·反馈方式共同塑造归因模式

学生需要看到的是「**这些因素塑造此概念**」，不是「**这些因素分别属于哪一层**」。如果某个因素的层级在该语境下真的重要，例如要强调「这是组织层面问题而非个体问题」，就用普通文字说明；**不要把层级标签机械贴到每一条因素前面**。

#### 规则 8：日中双语 KP 的整合性原则

适用场景：同一 KP 同时维护 `body.zh` 与 `body.ja`，尤其是 `prose`、`lead`、accordion `items[].desc`、group `groups[].items[].desc`、compare / quad / flat-list 的长文本字段。

##### 一、格式对齐：ZH 在哪里换行，JA 就要在对应位置换行

同一 KP 的中日双语 body 不只是「内容对应」，**视觉结构也必须一致**。读者扫一眼就应该看得出哪里是断点、哪里是并列、哪里是展开。

**反例**（修复前的 `k372` 感情劳动）：

- ZH `prose`：3 种策略各占 1 行，`\n` 分隔；下游影响再分 2 行
- JA `prose`：整段一气呵成，没有任何换行
- 结果：JA 版几乎看不出结构断点

**正例**：

- ZH 有几个 `\n`，JA 就有几个 `\n`
- 每个断点都应语义对应，而不是只做机械断行

##### 二、同一 KP 内标题与 body 的术语必须统一

最常见的错误是：**标题已经改成标准术语，body 还残留旧词或翻译腔近义词**。这种不一致会让学生误以为是两个概念。

典型案例：

| KP | 标题（标准） | body 残留（错误） | 修复方向 |
| --- | --- | --- | --- |
| `k370` EI | 感情知能 | 情動知能・情動の知覚… | 全部统一为「感情」系 |
| `k372` 情绪劳动 | 感情労働 | 情動表現・情動労働・情動的不協和… | 全部统一为「感情」；`emotional dissonance` 用 **感情的不協和** |

判定方法：优先检查「**标题含 X，body 却大量使用 Y**」这类竞争术语对。高频冲突包括：

- 感情 ↔ 情動
- 知覚された X ↔ X 知覚
- 片假名外来语 ↔ 生硬汉译词（如 `Job Embeddedness` 更常用 `ジョブ・エンベデッドネス`，不要硬写成「職務埋め込み」）

##### 三、删除翻译软件式的冗余说明句

翻译软件或早期生成稿常会在 JA 版**多塞一句抽象归纳句**，例如「XX が YY を形成する」「XX を決定する」「XX が要因となる」。如果 ZH 版根本没有对应句，而且这句只是为了凑结构、补层级、或制造“总结感”，就应删掉。

**反例**（修复前的 `k361` MBTI `lead`）：

> 安定した人格特性、文化的タイプ選好（西洋 = E 寄り、東洋 = I 寄り）がタイプ分布を形成する

ZH 版没有对应句；它本质上是早期为了凑「个体 / 群体 / 组织」分析框架而硬塞的说明句，与规则 7 属于同源问题。

##### 四、长文档 item 双语都要逐行展开

当 ZH 版把多个维度、步骤、对立项逐行展开时，JA 版也必须逐行展开；**不要把 ZH 的 4 行压成 JA 的 1 行**。

**反例**（修复前的 `k361` item 2「4 组对立次元」）：

- ZH：4 个维度各 1 行，并保留完整英文 `Extraversion / Sensing / iNtuition / Thinking / Feeling / Judging / Perceiving`
- JA：用 `·` 挤成 1 行，且漏掉完整英文

**正例**：

- ZH 一行一个维度，JA 也一行一个维度
- ZH 保留的关键英文全称，JA 也同步保留
- 双语都以“可扫读”为优先，而不是只求字面上翻完

#### 规则 9：中文 KP 译名「中文学界主流」原则

##### 一、三类常见非主流译名（按严重度）

###### 1. 日语词当中文（最严重）

症状：title / body 直接用日语汉字词，但中文学界已有不同的标准译法。

| 日语化中文（×） | 中文学界主流（√） | 学科 |
| --- | --- | --- |
| 雕琢（Job Crafting） | **重塑** | OB |
| 契合（P-O Fit） | **匹配** | HRM |
| 嵌入 / 职务嵌入 | **工作嵌入** | OB |
| 投入感 | **投入**（去「感」） | OB |
| 凝集性 / 集团 | **凝聚力 / 群体** | 群体心理 |
| 同调 | **从众** | 社会心理 |
| 浅虑（集团浅虑） | **思维**（群体思维 `Groupthink`） | OB |
| 统制（自我统制） | **控制** | 管理学 |
| 利益 | **利润**（when = `profit`） | 财务 |
| 控制焦点 | **调节焦点**（`Regulatory Focus`） | 人格心理 |
| 株主 / 株式会社 | **股东 / 股份有限公司**（但 JP 会社法语境可保留） | 公司治理 |
| 配当 | **股利** | 公司治理 |
| 予算 | **预算** | 财务 |
| 协同组合 / 相互会社 | **合作社 / 相互保险公司** | 公司治理 |
| 独禁法 | **反垄断法** | 法 |
| 公式化（`Formalization`） | **正规化** | 组织设计 |
| 权限委让 | **授权** | 组织设计 |
| 命令系统单元化 | **命令统一**（Fayol） | 古典管理 |
| 机能 | **职能**（`functional`） | 组织设计 |
| 部门别 | **部门**（去日语「别」） | 组织设计 |

###### 2. 概念名特定误译

| 错 | 对 | 来源 |
| --- | --- | --- |
| 需求层次理论（Maslow） | **需要层次理论** | 中文学界 `Need` 常译「需要」，「需求」偏经济学语境 |
| 欲求清单（Murray） | **需要清单** | 同上 |
| 达成动机 | **成就动机** | Atkinson `achievement motivation` 标准译 |
| 期待-价值 | **期望-价值** | `expectancy` 中文主流译「期望」 |
| 未成熟（Argyris） | **不成熟** | 阿吉里斯 `Immaturity-Maturity` 标准译 |
| 组织正义 / 关系性正义 / 信息正义 | **组织公平**（注：部分学派译「公正」，但 HRM 主流更偏「公平」） | Greenberg 1987 |
| 工作要求-资源模型「岗位的要求度」 | **工作要求-资源模型 JD-R** | Demerouti 2001 国内综述常见写法 |

###### 3. 简体字未完全转换（最容易遗漏）

繁体 / 日语简化字混入简体文本时，必须补全转换：

- `経` → **经**（`経営` → 经营）
- `計` → **计**（`計画` → 计划）
- `画` → **划**（仅在「計画 / 计画」复合中）
- `論` → **论**（`理論` → 理论）
- `機` → **机**（但 `機能` 往往还应进一步改为「职能」）
- `総` → **总**（`総合` → 总体 / 综合）
- `業` → **业**（`業績` → 业绩）

典型例：`中期経営計画` → `中期经营计划`，`未成熟-成熟理論` → `不成熟-成熟理论`。

##### 二、判定流程

1. 看 title 是否含日语汉字词（如 `株` / `配当` / `予算` / `譲渡` / `独禁法` / `系統` / `単元化` / `機能` / `委让`）→ 几乎一定要改
2. 看 body 是否含中文学界已有标准译法的非主流译名（如 `公式化` / `中央集权` / `契合` / `雕琢` / `同调` / `集团浅虑`）→ 改
3. 看简体字是否完全转换（如 `経` / `計` / `論` / `総`）→ 改
4. 看 title 与 body 是否术语一致（如标题用「感情労働」，body 却满篇「情動」）→ 与规则 8 重合，统一处理

##### 三、执行原则

- **title 完整转换**为中文学界主流术语
- **body 完整转换**：含 `lead` / `prose` / `items[].name` / `items[].desc` / `groups[].title` / `groups[].items[]` / `cols[]` 各字段，以及 `evaluations.zh`
- **替换规则按字符长度降序排列**：例如「集团凝集性 → 群体凝聚力」必须先于「集团 → 群体」，否则会被前缀替换打乱
- **JP 法律实体名例外**：日本会社法专名（如 `株式会社` / `持分会社` / `新株予約権`）在 body 中可保留作技术术语；但 title 仍优先中文标准名，必要时括号补 JP 原名

##### 四、扫描脚本骨架

```python
def flatten(body):
    """所有文本字段拍平为一个字符串"""
    if not body:
        return ''
    s = body.get('lead', '') + body.get('prose', '')
    for it in body.get('items', []) or []:
        s += '|' + it.get('name', '') + '|' + it.get('desc', '')
    for g in body.get('groups', []) or []:
        for it in g.get('items', []) or []:
            s += '|' + it.get('name', '') + '|' + it.get('desc', '')
    for c in body.get('cols', []) or []:
        for f in ['title', 'keyword', 'desc', 'type', 'theories', 'detail']:
            s += '|' + (c.get(f, '') or '')
    return s

SUSPECT = [
    '雕琢', '契合', '凝集', '同调', '浅虑', '统制', '株主', '配当', '予算', '譲渡',
    '独禁法', '公式化', '权限委让', '単元化', '机能', '部门别',
    '需求层次', '达成动机', '未成熟', '组织正义', '岗位的要求度',
    '経', '計画', '理論', '総合', '業績',
]

for kp in all_kps:
    text = flatten(kp['body'].get('zh', {}))
    hits = [w for w in SUSPECT if w in text]
    if hits or any(w in kp['title']['zh'] for w in SUSPECT):
        print(kp['id'], kp['title']['zh'], hits)
```

#### 规则 10：重复 KP 的识别与合并删除

##### 一、识别重复

高频信号：

- 标题相似但 ID 不同（如「林格曼效应」`k551` vs「林格尔曼效应」`k1777978429779063`）
- 同一学者、同一概念、同一实验 / 年份
- 一个用 `flat-list` / narrative，另一个用 accordion 详尽展开

##### 二、合并 vs 删除决策

| 情况 | 处理 |
| --- | --- |
| 信息完全包含（A ⊂ B） | **删除 A**，保留 B |
| 各有独特内容 | **先合并 A → B**，再删 A |
| 不同视角但同一对象 | **保留两个**，但加交叉引用 |

##### 三、删除前必查 3 项

```python
# 1. 确认无其他 KP 引用被删 KP id
for kp in all_kps:
    if 'k551' in json.dumps(kp, ensure_ascii=False):
        print('reference found:', kp['id'])

# 2. 确认被删 KP 已不在所有 school 的 concepts[] 中
#    （API 删除通常会自动移除，但仍建议验证一次）

# 3. 确认 scholar 关联不会丢失
#    （若被删 KP 有学者，而保留 KP 尚未并入这些 scholar，要先补齐）
```

##### 四、删除 API

```bash
curl -X DELETE -H "Authorization: Bearer $TOK" \
  "https://study.sususu.org/api/kps/{kpid}?discipline=keiei"
# 返回 {"ok":true,...} 即成功
# 之后 schools/X 接口里 concepts[] 会自动剔除被删 id
```

##### 五、合并 → 删除流程（A → B）

```python
# 1. 读 A 和 B 的全部 body / scholars / schools
# 2. 把 A 的独特内容补到 B（通常加新 group 或 item）
# 3. 把 A 的 scholars 并集合并到 B（schools 同理）
# 4. 验证 B 内容完整、无遗漏
# 5. 删除 A
# 6. 全库扫描确认无残留引用 A 的字串
```

##### 六、本轮实例

| KP | 状态 | 原因 |
| --- | --- | --- |
| `k551` 林格曼效应（社会性懈怠） | **删除** | `k1777978429779063` 是其严格超集（多了 Latané 1979 条件、HRM 策略、远程工作议题） |
| `k1777978429779063` 林格尔曼效应（社会惰化） | 保留 | accordion 5 groups 更完整 |

编写背景：2026-05 中文译名审计第二轮，跨 9+ schools 修正 27 个 KP，并删除 1 个重复 KP。

判定 cheatsheet：日本会社法专名（`株式会社` / `持分会社` / `新株予約権`）在 body 可保留作技术术语；其他日语化词尽量改成中文学界主流；简体字混入必修；概念误译必修。

#### 规则 11：`lead` 必含「核心命题」（重要 KP）

**适用**：学派核心理论、考试高频等重要 KP 的 `body.zh.lead`（有 `lead` 字段时）。

**格式**：以「**核心命题**：」开头，紧跟**一句话**学术化命题——可作名词解释导入第一句；其后接原 lead 其余内容。

- 措辞接近考试名词解释：学术化、可读，避免「——A 也，B 也，C 也」式碎口语；也避免首句堆砌专名导致冗长。

**好示范**（公平理论）：核心命题写清「多维公平比较（分配 / 程序 / 互动）→ 不公平感抑制动机与承诺」。

**好示范**（期待理论）：核心命题写清「动机由理性预期驱动，非单纯需要内容」与「三道关」式洞察。

#### 规则 12：避免「只言片语」，用小论文口吻（body / evaluations）

`items[].desc`、`evaluations` 各字段等**论证与因果**处，应用**完整因果叙事**（段落 + 连接词如「因此」「这就是为什么」「本质上」），避免：

- 多个 bullet 短句堆砌（`A · B · C` 式）
- 期刊缩写喧宾夺主（如卷期页码占主导）
- 纯枚举式「高/中/低/无」而无机制说明

**推荐**：加粗短标题作段首，下面用完整句子成段；需要并列文献结论时，仍用段落归纳「共同发现」再落到实务含义。

#### 规则 13：段落化 vs 结构化——按内容本质选形式

**不要**机械「全文段落化」。

| 内容本质 | 形式 |
| --- | --- |
| **并列结构**（N 项概念 / N 种类型 / N 大要素） | **bullet 列表**（不用 ①②③；可用 `-` 或 `·` 分行） |
| **论证 / 因果链 / 学术批判** | 加粗短标题 + **完整段落**（小论文口吻） |
| **排序 / 流程 / 因果方向** | 用 `>` 或 `→` 表达顺序 |

**并列**典型标志：「三大」「4 种」「5 个原则」、维度 1/2/3、MBO 三要素、自我效能感四来源等——**每行一项**，概念名加粗 + 简短说明即可。

**论证**典型标志：「局限—现象—后果」「颠覆了…假设」「某元分析显示…」——用段落铺因果。

**反例**：用 `·` 把多项并列概念**挤成一行长句**（读者要扫读 N 次才能拆）。

**应用与扫描优先级**（新增 / 修订 / Unit 切换 review 时主动扫）：

1. lead 缺「核心命题」
2. body 里**该并列却用 `·` 碎句串一行**
3. evaluations 只言片语、缺因果链

---

### 一句话记忆口诀（KP 内容打磨）

> **「不写编号也不内联 KP id；写「为什么」不只「是什么」；学科语言不稀释；简体一致；evaluations 兜底；笔误先问再改；三层是工具不是模板；双语结构与术语都对齐；中文译名跟主流；重复先并后删；核心命题 lead；论证段落、并列列表。」**

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

