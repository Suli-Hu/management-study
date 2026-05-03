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
} from '~/schemas/kp-body-structured';
import type { ParsedBody, Format } from './body-parser';

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

export function emptyQuadBody(): QuadBody {
  return {
    format: 'quad',
    lead: '',
    yAxis: '',
    xAxis: '',
    cells: [
      { name: '', emoji: '', sub: '', detail: '' },
      { name: '', emoji: '', sub: '', detail: '' },
      { name: '', emoji: '', sub: '', detail: '' },
      { name: '', emoji: '', sub: '', detail: '' },
    ],
  };
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
  // quad
  return {
    format: 'quad',
    lead: parsed.lead,
    yAxis: parsed.yAxis,
    xAxis: parsed.xAxis,
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
 */
export function evalContentToEvaluations(evalContent: Record<string, string>): {
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
    parts.push(body.yAxis, body.xAxis);
    for (const c of body.cells) {
      parts.push(c.name, c.sub, c.detail);
    }
  }

  return parts.filter(Boolean).map(stripHtml).join(' ');
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}
