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
  meaning: string;
  limit: string;
}

export type ParsedBody =
  | { format: 'narrative'; raw: string }
  | ({ format: 'flat-list'; lead: string; items: Item[] } & Evaluations)
  | ({ format: 'accordion'; lead: string; groups: Group[] } & Evaluations)
  | ({ format: 'compare'; lead: string; cols: CompareCol[] } & Evaluations)
  | ({ format: 'quad'; lead: string; yAxis: string; xAxis: string; cells: QuadCell[] } & Evaluations);

const CIRCLED = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩', '⑪', '⑫', '⑬', '⑭', '⑮'];
const NUMBERED_RE = /^[①-⑮]/;

/** 抽出尾部 ◆意义—— / ◆局限—— 评价段，返 { rest, meaning, limit }。 */
function extractEvaluations(s: string): { rest: string; meaning: string; limit: string } {
  let working = s;
  let meaning = '';
  let limit = '';

  // 意义 (or 意義)
  const meaningRe = /◆\s*(?:意义|意義)\s*——\s*([^◆]*?)(?=◆|<\/compare>|<\/quad>|$)/;
  const m1 = working.match(meaningRe);
  if (m1) {
    meaning = m1[1].trim().replace(/[；;\s]+$/, '');
    working = working.slice(0, m1.index!) + working.slice(m1.index! + m1[0].length);
  }

  const limitRe = /◆\s*(?:局限|限界)\s*——\s*([^◆]*?)(?=◆|<\/compare>|<\/quad>|$)/;
  const m2 = working.match(limitRe);
  if (m2) {
    limit = m2[1].trim().replace(/[；;\s]+$/, '');
    working = working.slice(0, m2.index!) + working.slice(m2.index! + m2[0].length);
  }

  return { rest: working, meaning, limit };
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

  const { rest: working, meaning, limit } = extractEvaluations(body);

  if (format === 'compare') {
    const m = working.match(/^([\s\S]*?)<compare>([\s\S]+?)<\/compare>([\s\S]*)$/i);
    if (!m) return { format: 'compare', lead: working.trim(), cols: [], meaning, limit };
    const lead = m[1].trim().replace(/[:：]\s*$/, '');
    const cols = m[2].split('||').map((c) => c.trim()).filter(Boolean).map((c) => {
      const f = c.split('|').map((s) => s.trim());
      return {
        title: f[0] ?? '', keyword: f[1] ?? '', desc: f[2] ?? '',
        type: f[3] ?? '', theories: f[4] ?? '', detail: f[5] ?? '',
      };
    });
    return { format: 'compare', lead, cols, meaning, limit };
  }

  if (format === 'quad') {
    const m = working.match(/^([\s\S]*?)<quad>([\s\S]+?)<\/quad>([\s\S]*)$/i);
    if (!m) return { format: 'quad', lead: working.trim(), yAxis: '', xAxis: '', cells: [], meaning, limit };
    const lead = m[1].trim().replace(/[:：]\s*$/, '');
    const parts = m[2].split('||');
    const axes = (parts[0] ?? '').split(',').map((s) => s.trim());
    const yAxis = axes[0] ?? '';
    const xAxis = axes[1] ?? '';
    const cells = parts.slice(1).map((c) => c.trim()).filter(Boolean).map((c) => {
      const f = c.split('|').map((s) => s.trim());
      return { name: f[0] ?? '', emoji: f[1] ?? '', sub: f[2] ?? '', detail: f[3] ?? '' };
    });
    return { format: 'quad', lead, yAxis, xAxis, cells, meaning, limit };
  }

  if (format === 'accordion') {
    // 找所有 【title】 marker，分组
    const groupRe = /<br\s*\/?>?\s*【\s*([^】]+?)\s*】\s*<br\s*\/?>?/g;
    const matches = [...working.matchAll(groupRe)];
    if (matches.length === 0) {
      return { format: 'accordion', lead: working.trim(), groups: [], meaning, limit };
    }
    const lead = working.slice(0, matches[0].index).trim();
    const groups: Group[] = [];
    matches.forEach((m, i) => {
      const start = m.index! + m[0].length;
      const end = i + 1 < matches.length ? matches[i + 1].index! : working.length;
      const itemsStr = working.slice(start, end);
      groups.push({ title: m[1].trim(), items: parseNumberedItems(itemsStr) });
    });
    return { format: 'accordion', lead, groups, meaning, limit };
  }

  // flat-list
  const firstDiamond = working.indexOf('◆');
  if (firstDiamond < 0) {
    return { format: 'flat-list', lead: working.trim(), items: [], meaning, limit };
  }
  const lead = working.slice(0, firstDiamond).replace(/[:：]\s*$/, '').trim();
  const items = parseDiamondItems(working.slice(firstDiamond));
  return { format: 'flat-list', lead, items, meaning, limit };
}

export function serializeBody(parsed: ParsedBody): string {
  if (parsed.format === 'narrative') return parsed.raw;

  const evalSuffix =
    (parsed.meaning ? `◆意义——${parsed.meaning}` : '') +
    (parsed.limit ? `◆局限——${parsed.limit}` : '');

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
  const base = { lead: '', meaning: '', limit: '' };
  if (format === 'flat-list') return { format, ...base, items: [] };
  if (format === 'accordion') return { format, ...base, groups: [] };
  if (format === 'compare') return { format, ...base, cols: [] };
  return { format: 'quad', ...base, yAxis: '', xAxis: '', cells: [] };
}
