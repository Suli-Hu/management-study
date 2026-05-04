/**
 * KP body 结构化重构的工具函数 (v0.8.0 Stage 0)
 *
 * 提供：
 *   - emptyKpBody(format)：每种 format 的空白模板（编辑器初始化 / 切 format 时用）
 *   - parsedToStructured(parsed)：现有 ParsedBody (string DSL) → 新 KpBody (结构化)
 *     用于 Stage 1 backfill 跑迁移脚本
 *   - structuredToSearchText(body)：把结构化 body 拼成搜索用纯文本（kp_fts 索引用）
 *
 * 不在本文件：
 *   - structured → string 反向（Stage 0 不需要，未来若需要再加）
 *   - structured → HTML（那是 renderer 的事，Stage 2 实现新 renderer）
 *
 * 设计原则：
 *   - 所有 helper 都纯函数（无副作用）
 *   - parsedToStructured 必须 lossless（对 5 种 format 而言）
 */

import type {
  KpBody,
  NarrativeBody,
  FlatListBody,
  AccordionBody,
  CompareBody,
  QuadBody,
  QuadAxis,
  KpEvaluationsLang,
} from '~/schemas/kp-body-structured';
import type { ParsedBody, Format, Evaluations } from './body-parser';
import { serializeBody } from './body-parser';

// ============================================================
// emptyKpBody — 每种 format 的空白模板
// ============================================================

export function emptyNarrativeBody(): NarrativeBody {
  return { format: 'narrative', prose: '' };
}

export function emptyFlatListBody(): FlatListBody {
  return {
    format: 'flat-list',
    lead: '',
    items: [{ name: '', desc: '' }],
  };
}

export function emptyAccordionBody(): AccordionBody {
  return {
    format: 'accordion',
    lead: '',
    groups: [{ title: '', items: [] }],
  };
}

export function emptyCompareBody(): CompareBody {
  return {
    format: 'compare',
    lead: '',
    cols: [
      { title: '', keyword: '', desc: '', type: '', theories: '', detail: '' },
      { title: '', keyword: '', desc: '', type: '', theories: '', detail: '' },
    ],
  };
}

export function emptyQuadAxis(): QuadAxis {
  return { low: '', label: '', high: '' };
}

export function emptyQuadBody(): QuadBody {
  return {
    format: 'quad',
    lead: '',
    yAxis: emptyQuadAxis(),
    xAxis: emptyQuadAxis(),
    cells: [
      { name: '', emoji: '', sub: '', detail: '' },
      { name: '', emoji: '', sub: '', detail: '' },
      { name: '', emoji: '', sub: '', detail: '' },
      { name: '', emoji: '', sub: '', detail: '' },
    ],
  };
}

/**
 * Smart split — 把旧 string yAxis/xAxis（v0.8.3 及以前）拆成 v0.8.4 QuadAxis。
 *
 * 优先级（v0.8.6 扩展）：`-` > `/` > `→` > `↑` > `↓` > `~`
 *   1. 含某个 sep：split → 3 段返 {low, label, high} / 2 段返 {low, '', high}
 *   2. 2 段且 sep 是箭头（→/↑/↓）且 first 段含空格：识为 "[label] [low]→[high]" 模式
 *      （prod 真实数据 k223 风：`市場成長率 低→高` → label="市場成長率", low="低", high="高"）
 *   3. 都失败 → null（无法 split，caller 处理）
 *
 * 注意：
 *   - `-` / `/` / `~` 的两段语义不带 label-low 模式（避免误识 `优势-劣势` 这种）
 *   - 4+ 段或首/尾空 → 试下一个 sep（保持原有兜底）
 *   - 返回 QuadAxis 时所有字段已 trim
 */
const SPLIT_DELIMITERS = ['-', '/', '→', '↑', '↓', '~'] as const;
const ARROW_DELIMITERS: ReadonlySet<string> = new Set(['→', '↑', '↓']);

export function splitQuadAxisString(s: string): QuadAxis | null {
  const trimmed = (s ?? '').trim();
  if (!trimmed) return null;

  for (const sep of SPLIT_DELIMITERS) {
    if (!trimmed.includes(sep)) continue;
    const parts = trimmed.split(sep).map((p) => p.trim());
    if (parts.length === 3 && parts[0] && parts[2]) {
      return { low: parts[0]!, label: parts[1] ?? '', high: parts[2]! };
    }
    if (parts.length === 2 && parts[0] && parts[1]) {
      // 箭头 sep + first 段含空格 → "[label words] [low]→[high]" 三段空格模式
      if (ARROW_DELIMITERS.has(sep)) {
        const firstWords = parts[0]!.split(/\s+/).filter(Boolean);
        if (firstWords.length >= 2) {
          return {
            low: firstWords[firstWords.length - 1]!,
            label: firstWords.slice(0, -1).join(' '),
            high: parts[1]!,
          };
        }
      }
      return { low: parts[0]!, label: '', high: parts[1]! };
    }
    // 4+ 段或首/尾空 — 试下一个分隔符
  }
  return null;
}

/** 给 format 拿空白 KpBody — 编辑器初始化 / 切 format 时调 */
export function emptyKpBody(format: Format): KpBody {
  switch (format) {
    case 'narrative':
      return emptyNarrativeBody();
    case 'flat-list':
      return emptyFlatListBody();
    case 'accordion':
      return emptyAccordionBody();
    case 'compare':
      return emptyCompareBody();
    case 'quad':
      return emptyQuadBody();
  }
}

// ============================================================
// parsedToStructured — 旧 ParsedBody → 新 KpBody
// 给 Stage 1 backfill / git JSON 迁移脚本用
// ============================================================

/**
 * 注意：parsed 自带 format flag。返回的 KpBody.format 必然 == parsed.format。
 *
 * 边界处理（PRD §5.2）：
 *   - flat-list items 为空 → 仍返 FlatListBody 但 items 空（zod parse 会拒）；
 *     调用方（迁移脚本）需 catch 这个，决定降级到 narrative 还是修数据
 *   - 同理 accordion groups / compare cols / quad cells
 *   - lead 字段全部保留（不丢）
 *   - Evaluations 不在 ParsedBody 里转 — 调用方用 `extractEvaluationsFromParsed` 单独抽
 */
export function parsedToStructured(parsed: ParsedBody): KpBody {
  if (parsed.format === 'narrative') {
    return { format: 'narrative', prose: parsed.raw };
  }
  if (parsed.format === 'flat-list') {
    return {
      format: 'flat-list',
      lead: parsed.lead,
      items: parsed.items.map((it) => ({ name: it.name, desc: it.desc })),
    };
  }
  if (parsed.format === 'accordion') {
    return {
      format: 'accordion',
      lead: parsed.lead,
      groups: parsed.groups.map((g) => ({
        title: g.title,
        items: g.items.map((it) => ({ name: it.name, desc: it.desc })),
      })),
    };
  }
  if (parsed.format === 'compare') {
    return {
      format: 'compare',
      lead: parsed.lead,
      cols: parsed.cols.map((c) => ({
        title: c.title,
        keyword: c.keyword,
        desc: c.desc,
        type: c.type,
        theories: c.theories,
        detail: c.detail,
      })),
    };
  }
  // quad — yAxis/xAxis 旧 ParsedBody 是 string，v0.8.4 改 QuadAxis 对象。
  // 用 splitQuadAxisString 智能拆；失败时落回 {low: raw, label: '', high: ''}（zod 会拒，
  // 但保留原值给 audit / migrate-quad-axes 端点 dirty list）。
  return {
    format: 'quad',
    lead: parsed.lead,
    yAxis: splitQuadAxisString(parsed.yAxis) ?? { low: parsed.yAxis, label: '', high: '' },
    xAxis: splitQuadAxisString(parsed.xAxis) ?? { low: parsed.xAxis, label: '', high: '' },
    cells: parsed.cells.map((c) => ({
      name: c.name,
      emoji: c.emoji,
      sub: c.sub,
      detail: c.detail,
    })),
  };
}

/**
 * 旧 evalContent dict (key=glyph 字符 '义/限/例/应/用/喻') → 新 KpEvaluationsLang 形态。
 * 给 v0.8.0 Stage 1 双写时把 evalContent 字段转换到新列用。
 *
 * 接受 partial dict（KP schema 里 evalContent 是 Record<string, string | undefined>），
 * 内部 `?? ''` 处理 undefined 字段。
 */
export function evalContentToEvaluations(evalContent: Record<string, string | undefined>): {
  meaning: string;
  limit: string;
  example: string;
  response: string;
  application: string;
  analogy: string;
} {
  return {
    meaning: evalContent['义'] ?? '',
    limit: evalContent['限'] ?? '',
    example: evalContent['例'] ?? '',
    response: evalContent['应'] ?? '',
    application: evalContent['用'] ?? '',
    analogy: evalContent['喻'] ?? '',
  };
}

/**
 * 抽出 ParsedBody 里的 6 个 evaluations 字段。
 * 旧 ParsedBody 把它们和 body 内容混在一起；新 schema 是独立 KpEvaluations 字段。
 */
export function extractEvaluationsFromParsed(parsed: ParsedBody): {
  meaning: string;
  limit: string;
  example: string;
  response: string;
  application: string;
  analogy: string;
} {
  if (parsed.format === 'narrative') {
    return {
      meaning: '', limit: '', example: '', response: '', application: '', analogy: '',
    };
  }
  return {
    meaning: parsed.meaning ?? '',
    limit: parsed.limit ?? '',
    example: parsed.example ?? '',
    response: parsed.response ?? '',
    application: parsed.application ?? '',
    analogy: parsed.analogy ?? '',
  };
}

// ============================================================
// structuredToSearchText — kp_fts 索引用纯文本
// ============================================================

/**
 * 把结构化 body 拼成纯文本（去 marker、保留 lead/items/desc 等内容）。
 * 给 Stage 1 后 kp_fts trigram 索引用 — 让全文搜索仍能命中 body 内字段内容。
 */
export function structuredToSearchText(body: KpBody): string {
  if (body.format === 'narrative') return stripHtml(body.prose);

  const parts: string[] = [];
  if (body.lead) parts.push(body.lead);

  if (body.format === 'flat-list') {
    for (const it of body.items) parts.push(it.name, it.desc);
  } else if (body.format === 'accordion') {
    for (const g of body.groups) {
      parts.push(g.title);
      for (const it of g.items) parts.push(it.name, it.desc);
    }
  } else if (body.format === 'compare') {
    for (const c of body.cols) {
      parts.push(c.title, c.keyword, c.desc, c.type, c.theories, c.detail);
    }
  } else if (body.format === 'quad') {
    parts.push(body.yAxis.low, body.yAxis.label, body.yAxis.high);
    parts.push(body.xAxis.low, body.xAxis.label, body.xAxis.high);
    for (const c of body.cells) {
      parts.push(c.name, c.sub, c.detail);
    }
  }

  return parts.filter(Boolean).map(stripHtml).join(' ');
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

// ============================================================
// 反向桥：structured → legacy （v0.8.0 Stage 3 写入时填旧列用）
//
// 新 contract 接受 structured KpBody，但 D1 旧列 (body_zh / format / eval_content_*_json)
// 在 Stage 5 才 drop。Stage 3-4 期间写入路径需要从结构化反推旧列：
//   - body_zh / body_ja      ← structuredToLegacyDsl(KpBody)
//   - format                 ← body.zh.format
//   - eval_content_*_json    ← evaluationsLangToLegacyEvalContent(KpEvaluationsLang)
//
// 这些 helper 不嵌入 evaluations 到 DSL（v0.8.0 起 evaluations 必须在独立列），
// 也保持 lossless：序列化后再 parseBody 能回到等价 ParsedBody。
// ============================================================

const EMPTY_LEGACY_EVALS: Evaluations = {
  meaning: '',
  limit: '',
  example: '',
  response: '',
  application: '',
  analogy: '',
};

/**
 * 把结构化 KpBody 反推成旧 DSL 字符串（不含 ◆评价—— 段）。
 * 用于 Stage 3-4 双写期 body_zh / body_ja 旧列。
 *
 * compare/quad 需特殊处理：序列化时若所有列/格的 trailing 字段为空，serializeBody
 * 会写出 `|||...` 多余分隔符，与 col separator `||` 撞车，导致 parseBody 反向解析
 * 多出空 col / cell。这里 inline 实现 compare/quad — trim 每个 col/cell 的 trailing
 * 空字段，保证 round-trip 干净。flat-list / accordion / narrative 的 serializeBody
 * 输出本身已 round-trip 干净，复用即可。
 */
export function structuredToLegacyDsl(body: KpBody): string {
  if (body.format === 'narrative') return body.prose;

  if (body.format === 'flat-list') {
    return serializeBody({
      format: 'flat-list',
      lead: body.lead,
      items: body.items.map((it) => ({ name: it.name, desc: it.desc })),
      ...EMPTY_LEGACY_EVALS,
    });
  }
  if (body.format === 'accordion') {
    return serializeBody({
      format: 'accordion',
      lead: body.lead,
      groups: body.groups.map((g) => ({
        title: g.title,
        items: g.items.map((it) => ({ name: it.name, desc: it.desc })),
      })),
      ...EMPTY_LEGACY_EVALS,
    });
  }
  if (body.format === 'compare') {
    let s = body.lead;
    if (s && body.cols.length > 0) s += '：';
    const colsStr = body.cols
      .map((c) => trimTrailing([c.title, c.keyword, c.desc, c.type, c.theories, c.detail]).join('|'))
      .join('||');
    return `${s}<compare>${colsStr}</compare>`;
  }
  // quad — v0.8.4: yAxis/xAxis 是 QuadAxis 对象，反推时合并成 legacy string `low-label-high`。
  let s = body.lead;
  const yAxisStr = quadAxisToLegacyString(body.yAxis);
  const xAxisStr = quadAxisToLegacyString(body.xAxis);
  if (s && (body.cells.length > 0 || yAxisStr || xAxisStr)) s += '：';
  const cellsStr = body.cells
    .map((c) => trimTrailing([c.name, c.emoji, c.sub, c.detail]).join('|'))
    .join('||');
  return `${s}<quad>${yAxisStr},${xAxisStr}||${cellsStr}</quad>`;
}

/** QuadAxis → legacy 单字符串：label 空时 `low-high`，label 非空时 `low-label-high`。 */
function quadAxisToLegacyString(axis: QuadAxis): string {
  return axis.label ? `${axis.low}-${axis.label}-${axis.high}` : `${axis.low}-${axis.high}`;
}

/** 删除数组尾部连续的空字符串（保留至少 1 个元素 — 因为 title/name 是必填）。 */
function trimTrailing(fields: string[]): string[] {
  let last = fields.length - 1;
  while (last > 0 && fields[last] === '') last--;
  return fields.slice(0, last + 1);
}

/**
 * 新 KpEvaluationsLang (英文 key) → 旧 evalContent dict (glyph key)。
 * 用于 Stage 3-4 双写期 eval_content_*_json 旧列。
 */
export function evaluationsLangToLegacyEvalContent(
  evals: KpEvaluationsLang,
): Record<string, string> {
  return {
    义: evals.meaning ?? '',
    限: evals.limit ?? '',
    例: evals.example ?? '',
    应: evals.response ?? '',
    用: evals.application ?? '',
    喻: evals.analogy ?? '',
  };
}

/** 判 evaluations 实际有内容（任一字段非空）— 用于决定写 null 还是 JSON。 */
export function hasEvaluationsContent(evals: KpEvaluationsLang | undefined | null): boolean {
  if (!evals) return false;
  return (
    Boolean(evals.meaning) ||
    Boolean(evals.limit) ||
    Boolean(evals.example) ||
    Boolean(evals.response) ||
    Boolean(evals.application) ||
    Boolean(evals.analogy)
  );
}
