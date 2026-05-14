# KP 写作完整经验总结

> **仓库路径**：`agent/KP_WRITING_GUIDE.md` — 老师 / 内容 agent **必读**；在 `agent/TEACHER.md` 与 `agent/README.md` 冷启动顺序中排在 `TEACHER.md` 之前。  
> 2026 年 5 月，sususu 经営学平台「群体层面」+「个体层面」大规模 fact-check + 清理 + 内容补全过程沉淀的全部经验

---

## 一、最高元规则：Truth-First 真实性优先 🔴

### 教训事件

**k529「领导力的边界澄清」编造引用事件**：写 KP 时编造了 `Holman 1961`——
- 真实情况：拼写错误（实际是 `Holloman`，且年份是 1968）
- 真正的开山者：**Cecil Gibb 1947《The Principles and Traits of Leadership》**（Journal of Abnormal and Social Psychology）
- 这是**彻底的编造**，违反 TEACHER.md 元规则

### 强制工作流：WebFetch 验证

**任何引用前必须验证**：
- 学者英文姓名拼写
- 年份（差 1-2 年是不同人 / 不同论文）
- 著作 / 期刊 / 卷期
- "首次提出 / 创立"类断言

### 验证操作

```bash
# Google Scholar 查证
WebFetch url="https://scholar.google.com/scholar?q=<学者>+<关键词>" \
        prompt="Verify: is there a real paper by X (year) about Y?"

# Wikipedia 查证
WebFetch url="https://en.wikipedia.org/wiki/<学者英文名>" \
        prompt="When did X publish on Y?"
```

### 风险评估清单（每次写引用前）

- [ ] 学者英文姓名拼写是否 100% 确定？
- [ ] 年份是否经权威源验证（不是凭印象）？
- [ ] 著作 / 论文标题是否真实存在？
- [ ] 不确定时是否标注"待查证"？

### 已知教训清单

| KP | 错误 | 真实 |
|---|---|---|
| k529 | Holman 1961（编造）| Gibb 1947 |
| k802 | Owens-Hekman 2013 | 实际 2012（foundational AMJ）|
| k596 | Pondy 1967 → audit 误报 1966 | 1967 ASQ 是真实的（不要盲信 audit）|

**重要教训**：**Fact-check 不仅针对自己——audit agent 也可能误报**。所有 audit 结果同样需要二次验证。

---

## 二、KP 写作风格 4 大铁律

### 铁律 0 · Lead 不写"核心命题："前缀

❌ 违规：
```
**核心命题**：**Simon 提出**：人的理性是有限的...
```

✅ 正确：
```
**Simon 提出**：人的理性是有限的...
```

**理由**：Lead 是第一段，**本身就是核心命题**，不需要额外标签。

### 铁律 1 · 引用极简化

❌ 违规：
```
**Herbert A. Simon 1955《A Behavioral Model of Rational Choice》**（Quarterly Journal of Economics）提出：人的理性是有限的
```

✅ 正确：
```
**Simon 提出**：人的理性是有限的
```

**完整引用归位**：年份 + 书名 + 期刊放 `evaluations.meaning`：
```
**出处**：Simon 1955《A Behavioral Model of Rational Choice》Quarterly Journal of Economics、Simon 1957《Models of Man》。
```

### 铁律 2 · 案例归位

❌ 违规：在 body 中写：
```
**Satisficing**：Satisfy + Suffice 合成词。例：买房时不会看完所有房子，而是定下"3 房 + 30 分钟通勤"的基本标准...
```

✅ 正确：body 只写原理：
```
**Satisficing**：Satisfy（满足）+ Suffice（足够）= Satisficing。Simon 创造的合成词。现实决策不是"扫描全部方案，选最优"，而是"按顺序检查方案，找到第一个足够好的就停止"。
```

然后**案例全部归 evaluations.example**：
```
**经典案例：买房决策**：不会看完所有房源，定下基本标准（3 房、30 分钟通勤、预算内）后，遇到第一个满足这些标准的就买。这是 Satisficing 而非 Maximizing。
```

### 铁律 3 · 禁用 ① 和 ——

❌ 违规：
```
受 ① 信息不完备 ② 认知能力有限 ③ 时间约束 三大限制——这是 Simon 核心命题
```

✅ 正确：用顿号 + 冒号
```
受信息不完备、认知能力有限、时间约束三大限制：这是 Simon 核心命题
```

**全部禁用符号**：
- `①②③④⑤⑥⑦⑧⑨⑩`（带圆圈数字）
- `——`（长破折号 em-dash）
- `—`（单个长破折号）

**替代符号**：
- 列举并列：`、`（顿号）或 `-` bullet
- 解释/引出：`：`（中文冒号）
- 多段并列：换行 + 加粗标题

---

## 三、KP 结构原则

### 金字塔结构：核心原理优先 + 派生后置

❌ 散点列表（坏）：
```
现象 1：详述定义 + 实验 + 前提 + 机制
现象 2：详述定义 + 案例 + 机制 + 推论
```

✅ 金字塔结构（好）：
```
⭐ 核心原理（1-2 句）：
  现象 1 = X 触发 Y → 结果 A
  现象 2 = X' 触发 Y' → 结果 B
  → 一切下面都是这个原理的派生

派生 1：实证证据
派生 2：反向现象
应用：实务推论 + 跨理论联动
```

### 多人引用保留 1 个最权威

❌ 违规：
```
（Kotter 1990 / Zaleznik 1977）
（Holman 1961 / Bennis 1989）
```

✅ 正确：
```
（Kotter 1990）        ← 最常引用 / 普及版
（Gibb 1947）          ← 真正开山者
```

**判断标准**：原创者 > 普及者 > 后续整合者

### 禁用 Markdown Table → Bullet 对比

❌ 违规（平台不渲染）：
```
| 维度 | A | B |
|---|---|---|
| 焦点 | X | Y |
```

✅ 正确（bullet 对比）：
```
- **焦点**：A 是 X；B 是 Y
- **活动**：A 是 X'；B 是 Y'
- **时间视角**：A 是 X''；B 是 Y''
```

### 完整短句优于碎片 bullet

❌ 违规（只言片语）：
```
- 潜在冲突
- 感知冲突
- 感受冲突
- 显性冲突
```

✅ 正确（完整可背诵的句子）：
```
- **潜在冲突**：组织结构性矛盾已存在但未被察觉
- **感知冲突**：当事方意识到冲突存在但未必情绪化
- **感受冲突**：冲突上升到情绪层面
- **显性冲突**：冲突外化为行为
```

---

## 四、Schools 管理

### 一个 KP 可挂多个 school

设计允许多 school 挂载，例如：
- k003 Weber 三种权威 → bureaucracy + static_structure + leadership_theory
- k150 SLT → contingency + leadership_theory

但要注意：**学派挂错很常见**。

### 伪学派识别

**典型伪学派**：
- `situational` 情境领导学派——实际是 Hersey-Blanchard 一个理论，不是学派
- 类似情况要清查：单一理论不该独立为 school

### 学派挂错的常见模式

发现的真实错误：
- k004 理想型官僚制挂在 leadership_theory（应在 bureaucracy / static_structure）
- k063 Chandler 结构跟随战略挂在 contingency（应在 design_s）
- k581/k579/k580/k582 群体心理学 KP 挂在 decision_theory（错位）

**审查方法**：每个 KP 看其内容核心命题对应的真正 school，不要盲信现有挂载。

---

## 五、学者管理

### 学者挂载常见问题

1. **空挂**：lead 提到学者但 scholars=[]（如 k243 提 Mintzberg 但学者空）
2. **拼写错误**：Holman vs Holloman vs Hollander 是 3 个不同人
3. **漏挂共同作者**：k362 Dark Triad 只挂 Paulhus 漏 Williams
4. **错误归因**：k270 LMX 写错 scholar=rotter（应是 graen）

### 新建学者的 truth-first 流程

```python
# 1. WebFetch 验证学者基本信息（姓名、生卒、机构、贡献）
# 2. POST 创建学者：
{
    'key': 'lastname_initial',  # 用 'lastname_xx' 防止冲突
    'name': {'zh': '中文名', 'en': 'English Name', 'ja': 'カタカナ名'},
    'schools': ['school_key'],
    'contribution': {'zh': '具体贡献，不要泛泛而谈'},
    'institution': '所属机构',
    'born': '1900年X月X日',  # 必须是 string 类型
    'died': '2000年X月X日',  # 可选
    'nationality': '国籍',
    'flag': '🇺🇸',
    'field': '研究领域'
}
```

**重点**：truth-first 适用于 born/died/institution——不确定就留空，绝不编造。

---

## 六、双语纯度规则

### zh 字段禁日文字符

- **片假名 (katakana) ≥ 3 字符** → 违规
- **平假名 (hiragana) ≥ 2 字符** → 违规

### 例外：专名 + 书名

允许格式：**中文（English / 日文原文）**

❌ 违规：
```
Simon 提出的「リーダーシップ行動の科学」是经典
```

✅ 正确：
```
Simon 提出的《领导力行动的科学》（1966 日文原著）是经典
```

### 验证脚本

```python
KATA = re.compile(r'[ァ-ヶー・]+')
HIRA = re.compile(r'[ぁ-ゔ]+')
kb = [m for m in KATA.findall(all_zh_text) if len(m) >= 3]
hb = [m for m in HIRA.findall(all_zh_text) if len(m) >= 2]
# 应该都为空
```

---

## 七、审计流程

### Phase 1: 用 Explore agent 扫描

```
Agent prompt:
1. 扫描 N 个 school 的所有 KP
2. 检查：引用真实性 / 学派挂载 / 学者挂载 / 内容质量 / markdown table / 双语纯度
3. 输出按 P0-P3 严重度分级的清单
4. 不修改任何 KP，只列问题
```

### Phase 2: Audit 结果二次验证

**关键教训**：audit agent 也可能错误。任何 audit 标记的"严重错误"必须自己 WebFetch 二次验证。

例：audit 报"k596 Pondy 1967 应是 1966"——实际上 1967 是真实正确的（5 阶段模型论文），1966 是 Pondy 另一篇论文。

### Phase 3: 修复优先级

- **P0 严重**：编造引用、事实错误、空壳无内容
- **P1 重要**：学派/学者错挂、引用拼写错误
- **P2 一般**：缺 lead / markdown table 残留
- **P3 优化**：标题啰嗦、风格不统一

---

## 八、API 关键陷阱

### limit=50 默认陷阱 🚨

```bash
# ❌ 错误：默认只返回 50 个 KP
curl "https://study.sususu.org/api/kps?discipline=keiei"

# ✅ 正确：明确指定 limit
curl "https://study.sususu.org/api/kps?discipline=keiei&limit=200"

# ✅ 推荐：按 school 过滤
curl "https://study.sususu.org/api/kps?discipline=keiei&school=<key>&limit=100"
```

**真实事件**：之前用默认查询看到 50 KP，以为是全部，实际有 200+ KP。导致漏检大量 KP。

### API 端点速查

| 用途 | endpoint |
|---|---|
| Schools 列表 | `GET /api/schools?discipline=<key>&limit=200` |
| KP 按 school 查 | `GET /api/kps?discipline=<key>&school=<key>&limit=100` |
| 单 KP 详情 | `GET /api/kps/<kpid>?discipline=<key>` |
| 学者 | `GET /api/scholars?discipline=<key>&q=<query>` |
| 修改 KP | `PATCH /api/kps/<kpid>?discipline=<key>` |
| 删除 KP | `DELETE /api/kps/<kpid>?discipline=<key>` |
| 创建学者 | `POST /api/scholars?discipline=<key>` |

---

## 九、标准 KP 模板

### Body 结构（accordion format）

```json
{
  "format": "accordion",
  "lead": "**[学者名] 提出**：[核心命题 1-2 句完整可背诵的句子]：[关键概念定义]。是 [学派 / 领域] 的 [奠基 / 重要] 理论。",
  "groups": [
    {
      "title": "核心要点",
      "items": [
        {
          "name": "[要点 1 名称]",
          "desc": "完整可背诵的解释段落。可包含 bullet list 但不用 ① / ——。"
        }
      ]
    }
  ]
}
```

### Evaluations 4 字段

```json
{
  "meaning": "**[学者] 提出**：[核心命题，2-3 句包含完整定义]。\n\n**出处**：[完整学术引用——年份、书名、期刊、卷期]",
  "limit": "**[局限 1]**：详细解释。\n\n**[局限 2]**：详细解释。\n\n**[局限 3]**：详细解释。",
  "example": "**[经典案例名]**：详细描述案例及如何对应理论。\n\n**[现代实例]**：另一个案例。\n\n**[反例]**：如果适用。",
  "application": "**实务应用**：管理者 / 实务者如何应用这个理论。\n\n**考试应用**：考研 / 论文如何运用——能引用 [Y, Z] 显著加分。"
}
```

### 完整范例：k573 有限理性

**lead**：
```
**Simon 提出**：人的理性是"有限"的，受信息不完备、认知能力有限、时间与资源约束三大限制。因此现实决策不追求"最优解"，而是"满意解（Satisficing）"：找到第一个"足够好"的方案就停止搜索。颠覆古典经济学"完全理性人"假设，Simon 1978 诺贝尔经济学奖奠基理论。
```

**evaluations.meaning**：
```
**Simon 提出**：人的理性受信息、认知、时间三大限制，现实决策追求"满意解（Satisficing）"而非"最优解"，颠覆古典经济学"完全理性人"假设。Simon 因此获 1978 年诺贝尔经济学奖。

**出处**：Simon 1955《A Behavioral Model of Rational Choice》Quarterly Journal of Economics、Simon 1957《Models of Man》。
```

**evaluations.example**：
```
**经典案例：买房决策**：不会看完所有房源，定下基本标准（3 房、30 分钟通勤、预算内）后，遇到第一个满足这些标准的就买。这是 Satisficing 而非 Maximizing。

**反例（古典理性人）**：股市技术派试图"找到最优买点"，但现实中没人能扫描全部信息，最终仍是"满意"决策。
```

---

## 十、自检清单（每个 KP 写完后）

### 5 步自检

1. **Lead 检查**
   - [ ] 是否以"X 提出："开头（无"核心命题："前缀）？
   - [ ] 引用极简（无年份 / 书名 / 期刊）？
   - [ ] 1-2 句话核心命题 + 关键概念定义？

2. **Body 检查**
   - [ ] groups 含 markdown table（`|---|`）？→ 改 bullet 对比
   - [ ] 含 `①②③` 带圆圈数字？→ 改顿号 / 加粗标题
   - [ ] 含 `——` 长破折号？→ 改冒号 / 句号
   - [ ] 含案例（"例："/"案例："）？→ 移到 evaluations.example

3. **Evaluations 检查**
   - [ ] meaning 含完整出处（年份 + 书名 + 期刊）？
   - [ ] limit 列 2-3 个真实局限（不是凑数）？
   - [ ] example 含具体案例（非空泛）？
   - [ ] application 含实务 + 考试两层？

4. **双语纯度**
   - [ ] zh 字段无 katakana ≥3 / hiragana ≥2？
   - [ ] ja 字段无中文字符 / 简体中文表达？

5. **引用真实性**
   - [ ] 所有学者姓名 WebFetch 验证拼写？
   - [ ] 年份 WebFetch 验证准确？
   - [ ] 期刊 / 书名真实存在？
   - [ ] 如果不确定 → 标"待查证"

---

## 十一、Memory Rules 索引

所有相关 memory 规则（按优先级）：

| 优先级 | 规则 | 文件 |
|---|---|---|
| 🔴 元规则 | Truth-first WebFetch 验证 | `feedback_truth_first_commitment.md` |
| 🔴 元规则 | 引用规则（单一最权威 + 禁 markdown table）| `feedback_kp_citation_rule.md` |
| 🟠 铁律 | KP 简化风格（无核心命题前缀、案例归位、引用极简）| `feedback_kp_simple_style.md` |
| 🟠 铁律 | 禁用 ① / —— | `feedback_no_circle_numbers.md` |
| 🟡 规则 | 双语纯度 | `feedback_kp_bilingual_purity.md` |
| 🟡 规则 | 金字塔写作（核心原理优先）| `feedback_kp_principle_first_writing.md` |
| 🟡 规则 | 写作风格（lead 含核心命题、避免只言片语）| `feedback_kp_writing_style.md` |
| 🟡 规则 | Format 选择 | `feedback_kp_format_choice.md` |
| 🟡 规则 | 选择题选项设计 | `feedback_quiz_option_design.md` |
| 🟢 规则 | 题库 sync workflow | `feedback_quiz_to_库_workflow.md` |
| 🟢 规则 | Unit 切换 review | `feedback_unit_review_habit.md` |
| 🟢 规则 | KP 学前补 + 学后润 | `feedback_kp_pre_post_study_workflow.md` |

---

## 十二、典型错误案例与教训

### 案例 1：Holman 1961 编造事件（k529）

**事件**：写"领导力边界澄清"KP 时，凭印象写"Holman 1961"作为头领 vs 领导的引用。

**问题**：
- "Holman" 拼写错误，真实是 "Holloman"
- 年份错误，Holloman 是 1968 不是 1961
- 真正的开山者是 Cecil Gibb 1947 JASP

**教训**：
- 任何人名拼写不确定 → 必须 WebFetch
- 任何年份凭印象 → 必须 WebFetch
- 不能为"句子通顺"而编造

**修复**：删除 Holman 1961，改为 Cecil Gibb 1947（真实的开山者）。

### 案例 2：Pondy 1967 audit 误报

**事件**：audit agent 报告"k596 Pondy 1967 应改为 1966"

**问题**：audit agent 把 Pondy 两篇论文混淆——
- Pondy 1966 "A systems theory of organizational conflict" (Industrial Management Review)
- Pondy 1967 "Organizational Conflict: Concepts and Models" (ASQ) ← 5 阶段模型

**教训**：**audit 也可能错**。任何 audit 结果都需要二次 WebFetch 验证。盲信 audit 也违反 truth-first。

**修复**：保持 Pondy 1967 不变。

### 案例 3：limit=50 API 陷阱

**事件**：扫 leadership school 看到 30 KP，以为完成清单。后来发现总数其实 200+，漏了 13 个 KP（包括 k003 Weber、k149 Likert、k265 Blake-Mouton 等核心理论）。

**教训**：**永远显式指定 limit**——`?limit=200` 或按 school 过滤。

### 案例 4：markdown table 不渲染

**事件**：在 k529 等 9 个 KP 用 `|---|` 表格语法。

**问题**：sususu 平台不渲染 markdown table，显示为纯文本，视觉混乱。

**教训**：所有对比内容改为 bullet 对比格式（"维度：A 是 X；B 是 Y"）。

---

## 十三、批量处理工作流

### 标准批量处理流程

```
1. Phase 1: 用 Explore agent 系统扫描整个 school / discipline
   输出：P0-P3 分级问题清单

2. Phase 2: 设计修复方案
   - 删除：什么 KP 应删（重复 / 错位）
   - 合并：哪些 KP 应合（多人理论合一）
   - 重写：哪些 KP 应重写（编造 / 错误）
   - 新建：哪些 KP 应新增（漏掉的核心理论）

3. Phase 3: 用户确认方案

4. Phase 4: 批量执行（Python 脚本）
   - 每个引用前 WebFetch 验证（truth-first）
   - 按统一风格模板写
   - 双语 zh + ja 同步
   - 自检清单逐项过

5. Phase 5: 二次验证
   - 重新扫描确认无残留 markdown table
   - 双语纯度检查
   - 关键引用真实性二次确认
```

### 批量脚本结构

```python
import json, subprocess, os

def get(p):
    return json.loads(subprocess.run([
        'curl', '-sS', '-H', f'Authorization: Bearer {TOK}',
        f'https://study.sususu.org/api{p}'
    ], capture_output=True, text=True).stdout)

def patch_kp(kpid, payload):
    body = json.dumps(payload, ensure_ascii=False)
    r = subprocess.run([
        'curl', '-sS', '-X', 'PATCH',
        '-H', f'Authorization: Bearer {TOK}',
        '-H', 'Content-Type: application/json',
        '-d', body,
        f'https://study.sususu.org/api/kps/{kpid}?discipline=keiei'
    ], capture_output=True, text=True)
    return json.loads(r.stdout)

# 标准 4 字段补全
for kpid, content in REPLACEMENTS.items():
    res = patch_kp(kpid, {
        'body': {
            'zh': {'format': 'accordion', 'lead': content['lead_zh'], 'groups': content['groups_zh']},
            'ja': {'format': 'accordion', 'lead': content['lead_ja'], 'groups': content['groups_ja']}
        },
        'evaluations': {
            'zh': content['ev_zh'],
            'ja': content['ev_ja']
        }
    })
    print(f"{kpid}: {'✅' if res.get('ok') else '❌'}")
```

---

## 十四、结语

本指南是 2026 年 5 月 sususu 平台 leadership_theory（24 KPs）+ 个体层面（42 KPs）+ 群体层面（81 KPs）+ 动机理论（17 KPs）大规模整理过程的全部经验沉淀，含：

- **1 起编造事件**（Holman 1961）的纠错与防范规则
- **3 个新 memory 规则**建立（KP 引用规则 / KP 简化风格 / 禁用 ① 和 ——）
- **5 个 schools 系统审计**与修复
- **47+ KP 内容补全 + 24 个引用核验 + 18 处错位修复**
- **API 陷阱**（limit=50 默认）的发现与规避
- **Markdown table** 平台兼容性问题的全平台清理

**核心原则**：**Truth-first > Style > Speed**

宁可慢，不可错。宁可空白标"待查证"，不可凭印象编造。

---

**文档版本**：v1.0
**最后更新**：2026-05-14
**适用范围**：sususu.org keiei discipline KP 写作 / 审计 / 维护
