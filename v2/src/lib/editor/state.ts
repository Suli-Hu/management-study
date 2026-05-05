/**
 * KP 编辑器 v0.8 — EditorState shape + reducer-ish update helpers
 *
 * 设计：state 集中持有，UI 模块订阅；改 state 走 dispatch，触发订阅者重渲染。
 * 不引入 framework — 仅 vanilla TS + 浅订阅。
 *
 * 见 KP-EDITOR-V0.8-PRD.md §5.1。
 */

import type { KpBody, KpEvaluationsLang } from '~/schemas/kp-body-structured';

export type Format = 'narrative' | 'flat-list' | 'accordion' | 'compare' | 'quad';

export type Lang = 'zh' | 'ja';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export interface ErrorDetail {
  reason: string;
  message: string;
  field?: string;
}

export interface EditorState {
  // 元字段（不随 lang tab / format 变）
  id: string | null; // null = 新建模式（POST），非空 = 编辑模式（PATCH）
  discipline: string;
  schools: string[];
  scholars: string[];
  tags: string[];
  year: string;

  // 双语字段
  title: { zh: string; ja: string; en: string };
  body: { zh: KpBody; ja: KpBody | null };
  evaluations: { zh: KpEvaluationsLang | null; ja: KpEvaluationsLang | null };

  // UI-only
  activeLang: Lang;

  // 元
  isDirty: boolean;
  saveStatus: SaveStatus;
  errorDetail: ErrorDetail | null;
}

export interface EditorMetadata {
  schools: Array<{ key: string; label: string }>;
  scholars: Array<{ key: string; label: string; sub: string }>;
  tags: Array<{ key: string; label: string; color: string | null }>;
  disciplineLabel: string;
  disciplineKey: string;
  /** 编辑模式：返回链接（list 或来源页）；新建模式：默认 discipline 首页 */
  fromPath: string;
  fromLabel: string;
}

// ============================================================
// Initial state factories
// ============================================================

export function emptyEvaluationsLang(): KpEvaluationsLang {
  return { meaning: '', limit: '', example: '', response: '', application: '', analogy: '' };
}

export function emptyKpBodyByFormat(format: Format): KpBody {
  switch (format) {
    case 'narrative':
      return { format: 'narrative', prose: '' };
    case 'flat-list':
      return { format: 'flat-list', lead: '', items: [{ name: '', desc: '' }] };
    case 'accordion':
      return { format: 'accordion', lead: '', groups: [{ title: '', items: [] }] };
    case 'compare':
      return {
        format: 'compare',
        lead: '',
        cols: [
          { title: '', keyword: '', desc: '', type: '', theories: '', detail: '' },
          { title: '', keyword: '', desc: '', type: '', theories: '', detail: '' },
        ],
      };
    case 'quad':
      return {
        format: 'quad',
        lead: '',
        yAxis: { low: '', label: '', high: '' },
        xAxis: { low: '', label: '', high: '' },
        cells: [
          { name: '', emoji: '', sub: '', detail: '', detailBack: '' },
          { name: '', emoji: '', sub: '', detail: '', detailBack: '' },
          { name: '', emoji: '', sub: '', detail: '', detailBack: '' },
          { name: '', emoji: '', sub: '', detail: '', detailBack: '' },
        ],
      };
  }
}

export function makeNewState(discipline: string): EditorState {
  return {
    id: null,
    discipline,
    schools: [],
    scholars: [],
    tags: [],
    year: '',
    title: { zh: '', ja: '', en: '' },
    body: { zh: emptyKpBodyByFormat('narrative'), ja: null },
    evaluations: { zh: null, ja: null },
    activeLang: 'zh',
    isDirty: false,
    saveStatus: 'idle',
    errorDetail: null,
  };
}

export interface ExistingKpInit {
  id: string;
  discipline: string;
  title: { zh: string; ja?: string; en?: string };
  body: { zh: KpBody; ja?: KpBody };
  evaluations?: { zh?: KpEvaluationsLang; ja?: KpEvaluationsLang };
  schools: string[];
  scholars: string[];
  tags: string[];
  year: string;
}

export function makeEditingState(init: ExistingKpInit): EditorState {
  return {
    id: init.id,
    discipline: init.discipline,
    schools: [...init.schools],
    scholars: [...init.scholars],
    tags: [...init.tags],
    year: init.year ?? '',
    title: {
      zh: init.title.zh ?? '',
      ja: init.title.ja ?? '',
      en: init.title.en ?? '',
    },
    body: { zh: init.body.zh, ja: init.body.ja ?? null },
    evaluations: {
      zh: init.evaluations?.zh ?? null,
      ja: init.evaluations?.ja ?? null,
    },
    activeLang: 'zh',
    isDirty: false,
    saveStatus: 'idle',
    errorDetail: null,
  };
}

// ============================================================
// Store with shallow subscriber
// ============================================================

export type Listener = (state: EditorState) => void;

export class EditorStore {
  private state: EditorState;
  private listeners: Set<Listener> = new Set();

  constructor(initial: EditorState) {
    this.state = initial;
  }

  get(): EditorState {
    return this.state;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * 替换部分 state。markDirty 默认 true（除非 caller 明确传 false）。
   * 内部不深 clone — caller 负责传不可变更新。
   */
  update(patch: Partial<EditorState>, markDirty = true): void {
    const next: EditorState = { ...this.state, ...patch };
    if (markDirty) next.isDirty = true;
    this.state = next;
    this.notify();
  }

  /** 替换 body 的某语种（zh / ja），保持其它语种不变。 */
  setBody(lang: Lang, body: KpBody | null): void {
    const nextBody = { ...this.state.body, [lang]: body };
    this.update({ body: nextBody });
  }

  /**
   * 切 format（zh + ja 同步替换 — F5 强制）。
   * carryLead = 抽出的 lead-equivalent text（caller 由 format-switcher 负责）。
   */
  setFormat(newFormat: Format, carryLead: string): void {
    const newZh = applyCarryLead(emptyKpBodyByFormat(newFormat), carryLead);
    const nextBody: EditorState['body'] = { zh: newZh, ja: null };
    if (this.state.body.ja) {
      nextBody.ja = applyCarryLead(emptyKpBodyByFormat(newFormat), carryLead);
    }
    this.update({ body: nextBody });
  }

  /**
   * F5 同步：把 ja body 的 format 强制改成跟 zh.format 一致（清 ja body 内容，
   * carry ja 自身的 lead）。仅在 ja 存在且 format 不一致时调用。zh body 不动。
   */
  syncJaFormatToZh(): void {
    const { zh, ja } = this.state.body;
    if (!ja || ja.format === zh.format) return;
    const carryLead = extractLead(ja);
    const newJa = applyCarryLead(emptyKpBodyByFormat(zh.format), carryLead);
    this.update({ body: { ...this.state.body, ja: newJa } });
  }

  setEvaluations(lang: Lang, evals: KpEvaluationsLang | null): void {
    const nextEvals = { ...this.state.evaluations, [lang]: evals };
    this.update({ evaluations: nextEvals });
  }

  /**
   * 更新当前 active lang 的 quad body 一个 axis 字段。
   * 仅当 active body.format === 'quad' 时才生效；否则 no-op（防御性 — UI 不该这么调）。
   */
  updateAxisField(
    axis: 'yAxis' | 'xAxis',
    fld: 'low' | 'label' | 'high',
    value: string,
  ): void {
    const lang = this.state.activeLang;
    const body = this.state.body[lang];
    if (!body || body.format !== 'quad') return;
    const nextAxis = { ...body[axis], [fld]: value };
    const nextBody: KpBody = { ...body, [axis]: nextAxis };
    this.setBody(lang, nextBody);
  }

  setSaveStatus(status: SaveStatus, error: ErrorDetail | null = null): void {
    this.state = { ...this.state, saveStatus: status, errorDetail: error };
    this.notify();
  }

  /** 保存成功后 — clear dirty + 设 saved 状态。 */
  markSaved(idAfterCreate?: string): void {
    this.state = {
      ...this.state,
      isDirty: false,
      saveStatus: 'saved',
      errorDetail: null,
      ...(idAfterCreate ? { id: idAfterCreate } : {}),
    };
    this.notify();
  }

  private notify(): void {
    for (const l of this.listeners) l(this.state);
  }
}

// ============================================================
// Helpers
// ============================================================

/** 抽 KpBody 的 lead-equivalent text — narrative.prose / 其它 .lead。 */
export function extractLead(body: KpBody): string {
  if (body.format === 'narrative') return body.prose;
  return body.lead;
}

/** 把 carryLead 灌入新 KpBody — narrative 灌入 prose / 其它灌入 lead。 */
export function applyCarryLead(body: KpBody, lead: string): KpBody {
  if (!lead) return body;
  if (body.format === 'narrative') return { ...body, prose: lead };
  return { ...body, lead };
}

/** evaluations 任一字段非空 → 该语种应该送（不是 null fallback）。 */
export function hasEvaluationContent(evals: KpEvaluationsLang | null): boolean {
  if (!evals) return false;
  return Boolean(
    evals.meaning ||
      evals.limit ||
      evals.example ||
      evals.response ||
      evals.application ||
      evals.analogy,
  );
}

/** 标题字段去除 ja/en 空字符串，组装成 v0.8 send shape。 */
export function buildTitlePayload(title: EditorState['title']): { zh: string; ja?: string; en?: string } {
  const out: { zh: string; ja?: string; en?: string } = { zh: title.zh.trim() };
  if (title.ja.trim()) out.ja = title.ja.trim();
  if (title.en.trim()) out.en = title.en.trim();
  return out;
}
