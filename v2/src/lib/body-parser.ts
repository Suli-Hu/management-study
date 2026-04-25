/**
 * KP body DSL ⟷ struct 双向转换 (v0.4.8)
 *
 * 五种 format：
 *   narrative   — 不解析，原样 raw 字符串
 *   flat-list   — lead + ◆ name——desc 条目数组
 *   accordion   — lead + 【title】<br>①name——desc<br>②name——desc...  分组数组
 *   compare     — lead + <compare>title|keyword|desc|type|theories|detail||...</compare>
 *   quad        — lead + <quad>yAxis,xAxis||name|emoji|sub|detail||...</quad>
 *
 * 评价 ◆意义——XXX / ◆局限——YYY 在所有非 narrative 格式中可作为独立字段抽出。
 *
 * 用于编辑器：parseBody → render form → form change → serializeBody → preview/save。
 */

export type Format = 'narrative' | 'flat-list' | 'accordion' | 'compare' | 'quad';

export interface Item { name: string; desc: string }
export interface Group { title: string; items: Item[] }
export interface CompareCol {
  title: string; keyword: string; desc: string;
  type: string; theories: string; detail: string;
}
export interface QuadCell { name: string; emoji: string; sub: string; detail: string }

export interface Evaluations {
  meaning: string;     // 义 — 学术贡献 / 实务价值（论述题必答）
  limit: string;       // 限 — 不足 / 边界 / 被批判（论述题必答）
  example: string;     // 例 — 企业案例 / 事例
  response: string;    // 应 — 应对策略 / 处方
  application: string; // 用 — 实务应用场景
  analogy: string;     // 喻 — 比喻 / 类比记忆
}

/** 6 个评价 label 的中文全称 + 短标签 + 用于 body ◆ 标记的全称（多别名）。 */
export const EVAL_DEFS: Array<{
  key: keyof Evaluations;
  short: string;
  zhFull: string;       // 输入到 body 的标准全称
  aliases: string[];    // parser 接受的多种写法
}> = [
  { key: 'meaning',     short: '义', zhFull: '意义', aliases: ['意义', '意義'] },
  { key: 'limit',       short: '限', zhFull: '局限', aliases: ['局限', '限界'] },
  { key: 'example',     short: '例', zhFull: '例子', aliases: ['例子', '企业例', '例'] },
  { key: 'response',    short: '应', zhFull: '应对', aliases: ['应对', '應對'] },
  { key: 'application', short: '用', zhFull: '应用', aliases: ['应用', '應用'] },
  { key: 'analogy',     short: '喻', zhFull: '比喻', aliases: ['比喻', '譬喩'] },
];

export type ParsedBody =
  | { format: 'narrative'; raw: string }
  | ({ format: 'flat-list'; lead: string; items: Item[] } & Evaluations)
  | ({ format: 'accordion'; lead: string; groups: Group[] } & Evaluations)
  | ({ format: 'compare'; lead: string; cols: CompareCol[] } & Evaluations)
  | ({ format: 'quad'; lead: string; yAxis: string; xAxis: string; cells: QuadCell[] } & Evaluations);

const CIRCLED = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩', '⑪', '⑫', '⑬', '⑭', '⑮'];
const NUMBERED_RE = /^[①-⑮]/;

/** 抽出 body 里所有 ◆评价—— 段，返 { rest, evaluations }。EVAL_DEFS 决定支持哪些标签 + 别名。 */
function extractEvaluations(s: string): { rest: string; evaluations: Evaluations } {
  let working = s;
  const ev: Evaluations = {
    meaning: '', limit: '', example: '', response: '', application: '', analogy: '',
  };

  for (const def of EVAL_DEFS) {
    const aliasGroup = def.aliases.map((a) => a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
    const re = new RegExp(`◆\\s*(?:${aliasGroup})\\s*——\\s*([^◆]*?)(?=◆|</compare>|</quad>|$)`);
    const m = working.match(re);
    if (m) {
      ev[def.key] = m[1].trim().replace(/[；;\s]+$/, '');
      working = working.slice(0, m.index!) + working.slice(m.index! + m[0].length);
    }
  }

  return { rest: working, evaluations: ev };
}

function parseDiamondItems(s: string): Item[] {
  const parts = s.split('◆').map((p) => p.trim()).filter(Boolean);
  const items: Item[] = [];
  for (const p of parts) {
    const dashIdx = p.indexOf('——');
    if (dashIdx >= 0) {
      const name = p.slice(0, dashIdx).trim();
      const desc = p.slice(dashIdx + 2).trim().replace(/[；;]+$/, '');
      items.push({ name, desc });
    } else {
      // 没 —— 的可能是 eval 抽剩残片，跳过
    }
  }
  return items;
}

function parseNumberedItems(s: string): Item[] {
  const parts = s.split(/<br\s*\/?>/i).map((p) => p.trim()).filter(Boolean);
  const items: Item[] = [];
  for (const p of parts) {
    if (!NUMBERED_RE.test(p)) continue;
    const rest = p.slice(1).trim();
    const dashIdx = rest.indexOf('——');
    if (dashIdx >= 0) {
      items.push({ name: rest.slice(0, dashIdx).trim(), desc: rest.slice(dashIdx + 2).trim() });
    } else if (rest) {
      items.push({ name: rest, desc: '' });
    }
  }
  return items;
}

export function parseBody(body: string, format: Format): ParsedBody {
  if (format === 'narrative') return { format: 'narrative', raw: body };

  const { rest: working, evaluations } = extractEvaluations(body);

  if (format === 'compare') {
    const m = working.match(/^([\s\S]*?)<compare>([\s\S]+?)<\/compare>([\s\S]*)$/i);
    if (!m) return { format: 'compare', lead: working.trim(), cols: [], ...evaluations };
    const lead = m[1].trim().replace(/[:：]\s*$/, '');
    const cols = m[2].split('||').map((c) => c.trim()).filter(Boolean).map((c) => {
      const f = c.split('|').map((s) => s.trim());
      return {
        title: f[0] ?? '', keyword: f[1] ?? '', desc: f[2] ?? '',
        type: f[3] ?? '', theories: f[4] ?? '', detail: f[5] ?? '',
      };
    });
    return { format: 'compare', lead, cols, ...evaluations };
  }

  if (format === 'quad') {
    const m = working.match(/^([\s\S]*?)<quad>([\s\S]+?)<\/quad>([\s\S]*)$/i);
    if (!m) return { format: 'quad', lead: working.trim(), yAxis: '', xAxis: '', cells: [], ...evaluations };
    const lead = m[1].trim().replace(/[:：]\s*$/, '');
    const parts = m[2].split('||');
    const axes = (parts[0] ?? '').split(',').map((s) => s.trim());
    const yAxis = axes[0] ?? '';
    const xAxis = axes[1] ?? '';
    const cells = parts.slice(1).map((c) => c.trim()).filter(Boolean).map((c) => {
      const f = c.split('|').map((s) => s.trim());
      return { name: f[0] ?? '', emoji: f[1] ?? '', sub: f[2] ?? '', detail: f[3] ?? '' };
    });
    return { format: 'quad', lead, yAxis, xAxis, cells, ...evaluations };
  }

  if (format === 'accordion') {
    // 找所有 【title】 marker，分组
    const groupRe = /<br\s*\/?>?\s*【\s*([^】]+?)\s*】\s*<br\s*\/?>?/g;
    const matches = [...working.matchAll(groupRe)];
    if (matches.length === 0) {
      return { format: 'accordion', lead: working.trim(), groups: [], ...evaluations };
    }
    const lead = working.slice(0, matches[0].index).trim();
    const groups: Group[] = [];
    matches.forEach((m, i) => {
      const start = m.index! + m[0].length;
      const end = i + 1 < matches.length ? matches[i + 1].index! : working.length;
      const itemsStr = working.slice(start, end);
      groups.push({ title: m[1].trim(), items: parseNumberedItems(itemsStr) });
    });
    return { format: 'accordion', lead, groups, ...evaluations };
  }

  // flat-list
  const firstDiamond = working.indexOf('◆');
  if (firstDiamond < 0) {
    return { format: 'flat-list', lead: working.trim(), items: [], ...evaluations };
  }
  const lead = working.slice(0, firstDiamond).replace(/[:：]\s*$/, '').trim();
  const items = parseDiamondItems(working.slice(firstDiamond));
  return { format: 'flat-list', lead, items, ...evaluations };
}

export function serializeBody(parsed: ParsedBody): string {
  if (parsed.format === 'narrative') return parsed.raw;

  const evalSuffix = EVAL_DEFS
    .map((def) => parsed[def.key] ? `◆${def.zhFull}——${parsed[def.key]}` : '')
    .join('');

  if (parsed.format === 'flat-list') {
    let s = parsed.lead;
    if (s && parsed.items.length > 0) s += '：';
    s += parsed.items.map((it) => `◆ ${it.name}——${it.desc}`).join('');
    return s + evalSuffix;
  }

  if (parsed.format === 'accordion') {
    let s = parsed.lead;
    parsed.groups.forEach((g) => {
      s += `<br>【${g.title}】<br>`;
      s += g.items.map((it, i) => `${CIRCLED[i] ?? '①'}${it.name}——${it.desc}`).join('<br>');
    });
    return s + evalSuffix;
  }

  if (parsed.format === 'compare') {
    let s = parsed.lead;
    if (s && parsed.cols.length > 0) s += '：';
    s += '<compare>';
    s += parsed.cols.map((c) => [c.title, c.keyword, c.desc, c.type, c.theories, c.detail].join('|')).join('||');
    s += '</compare>';
    return s + evalSuffix;
  }

  if (parsed.format === 'quad') {
    let s = parsed.lead;
    if (s && (parsed.cells.length > 0 || parsed.yAxis || parsed.xAxis)) s += '：';
    s += '<quad>';
    s += `${parsed.yAxis},${parsed.xAxis}`;
    parsed.cells.forEach((c) => {
      s += `||${c.name}|${c.emoji}|${c.sub}|${c.detail}`;
    });
    s += '</quad>';
    return s + evalSuffix;
  }

  return '';
}

/** 切换 format 时调：把当前 parsed 序列化 → 用新 format 重新解析（lossy 但保 lead/eval）。 */
export function changeFormat(parsed: ParsedBody, newFormat: Format): ParsedBody {
  if (parsed.format === newFormat) return parsed;
  const str = serializeBody(parsed);
  return parseBody(str, newFormat);
}

/** 创建空白结构，用于新增 KP 或 format 切换无源时。 */
export function emptyParsed(format: Format): ParsedBody {
  if (format === 'narrative') return { format: 'narrative', raw: '' };
  const emptyEvals: Evaluations = {
    meaning: '', limit: '', example: '', response: '', application: '', analogy: '',
  };
  const base = { lead: '', ...emptyEvals };
  if (format === 'flat-list') return { format, ...base, items: [] };
  if (format === 'accordion') return { format, ...base, groups: [] };
  if (format === 'compare') return { format, ...base, cols: [] };
  return { format: 'quad', ...base, yAxis: '', xAxis: '', cells: [] };
}

/**
 * 从 body 内容自动 detect 真实结构 format。
 * 用于一次性 migration（修历史 format 字段标错的 KP）+ 编辑器 load 时校正显示。
 *
 * 策略（高优先级在前）：
 *   含 <compare>     → compare
 *   含 <quad>        → quad
 *   含 <br>【title】 → accordion
 *   含 ≥2 个 ◆name—— 或 ≥2 个 ①②③ 项 → flat-list
 *   否则             → narrative
 *
 * 注意：剥离 ◆评价 段（◆意义/◆局限/...）后再判断 ◆ 数量，
 *       否则只有评价的纯叙述 KP 会被误判 flat-list。
 */
export function detectFormatFromBody(body: string): Format {
  if (!body) return 'narrative';
  if (/<compare>/i.test(body)) return 'compare';
  if (/<quad>/i.test(body)) return 'quad';
  // 剥评价段
  const { rest } = extractEvaluations(body);
  if (/<br\s*\/?>?\s*【[^】]+】\s*<br\s*\/?>?/i.test(rest)) return 'accordion';
  const numberedCount = (rest.match(/[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮]/g) ?? []).length;
  const diamondCount = rest.split('◆').length - 1;
  // 至少 2 项才算结构（1 项可能是装饰性）
  if (numberedCount >= 2) return 'flat-list';
  if (diamondCount >= 2) return 'flat-list';
  return 'narrative';
}

/** 自动推导 tags 数组（短码 义/限/...）— 服务端在 PUT 前用，免 admin 重复劳动。 */
export function deriveTagsFromBody(body: string, format: Format): string[] {
  if (format === 'narrative') {
    // 仍 try parse evaluations from raw（用户可能在 narrative 里也写 ◆意义）
    const { evaluations } = extractEvaluations(body);
    return EVAL_DEFS.filter((d) => evaluations[d.key]).map((d) => d.short);
  }
  const parsed = parseBody(body, format);
  if (parsed.format === 'narrative') return [];
  return EVAL_DEFS.filter((d) => parsed[d.key]).map((d) => d.short);
}
