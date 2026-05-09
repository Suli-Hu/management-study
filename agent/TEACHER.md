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
- First mention of key terms: **localized name + `（English）`** where useful; avoid random language switching mid-paragraph.

## API/data notes (safety)
- **HTTP 调用清单（Base URL、鉴权、`discipline` key、GET 列表/POST 创建、curl）**：必读 `agent/API.md`；完整字段表见 https://study.sususu.org/docs/api-reference.md
- Treat tags as governed keys (not free text) where enforced by the system.
- Prefer D1-first / API-first flows for content changes; avoid reviving v1-era data editing paths.

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

