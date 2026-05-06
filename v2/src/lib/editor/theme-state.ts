/**
 * Theme (ThemeGroup) editor v0.8 — EditorState shape + EditorStore
 *
 * Flat layout: key (new only) / title.zh/ja/en / desc.zh/ja / tags
 *
 * 注：theme.schools[] 字段不在编辑器渲染 — 由 schools/new 时选 themeKey + reorder API
 * 维护，theme PUT endpoint 不接受 schools 字段（强制保留原值）。
 *
 * 见 v2/docs/SCHOOL-SCHOLAR-THEME-EDITOR-V0.8-PRD.md §5.3
 */

import type { SaveStatus, ErrorDetail } from './school-state';
export type { SaveStatus, ErrorDetail } from './school-state';

export interface ThemeEditorState {
  key: string | null;
  discipline: string;
  title: { zh: string; ja: string; en: string };
  desc: { zh: string; ja: string };
  tags: string[];

  isDirty: boolean;
  saveStatus: SaveStatus;
  errorDetail: ErrorDetail | null;
}

export interface ThemeEditorMetadata {
  tags: Array<{ key: string; label: string; color: string | null }>;
  disciplineLabel: string;
  disciplineKey: string;
  fromPath: string;
  fromLabel: string;
  /** v0.11.5: 删除 gate — 该 theme 下 school 数 > 0 时拒删（避免悬空 FK） */
  deleteGate?: { schoolCount: number };
}

// ============================================================
// Initial state factories
// ============================================================

export function makeNewThemeState(discipline: string): ThemeEditorState {
  return {
    key: null,
    discipline,
    title: { zh: '', ja: '', en: '' },
    desc: { zh: '', ja: '' },
    tags: [],
    isDirty: false,
    saveStatus: 'idle',
    errorDetail: null,
  };
}

export interface ExistingThemeInit {
  key: string;
  discipline: string;
  title: { zh: string; ja?: string; en?: string };
  desc?: { zh?: string; ja?: string };
  tags: string[];
}

export function makeEditingThemeState(init: ExistingThemeInit): ThemeEditorState {
  return {
    key: init.key,
    discipline: init.discipline,
    title: {
      zh: init.title.zh ?? '',
      ja: init.title.ja ?? '',
      en: init.title.en ?? '',
    },
    desc: {
      zh: init.desc?.zh ?? '',
      ja: init.desc?.ja ?? '',
    },
    tags: [...(init.tags ?? [])],
    isDirty: false,
    saveStatus: 'idle',
    errorDetail: null,
  };
}

// ============================================================
// Store
// ============================================================

export type Listener = (state: ThemeEditorState) => void;

export class ThemeEditorStore {
  private state: ThemeEditorState;
  private listeners: Set<Listener> = new Set();

  constructor(initial: ThemeEditorState) {
    this.state = initial;
  }

  get(): ThemeEditorState {
    return this.state;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  update(patch: Partial<ThemeEditorState>, markDirty = true): void {
    const next: ThemeEditorState = { ...this.state, ...patch };
    if (markDirty) next.isDirty = true;
    this.state = next;
    this.notify();
  }

  setSaveStatus(status: SaveStatus, error: ErrorDetail | null = null): void {
    this.state = { ...this.state, saveStatus: status, errorDetail: error };
    this.notify();
  }

  markSaved(): void {
    this.state = {
      ...this.state,
      isDirty: false,
      saveStatus: 'saved',
      errorDetail: null,
    };
    this.notify();
  }

  private notify(): void {
    for (const l of this.listeners) l(this.state);
  }
}

// ============================================================
// Payload builders
// ============================================================

export function buildI18nTitle(
  title: ThemeEditorState['title'],
): { zh: string; ja?: string; en?: string } {
  const out: { zh: string; ja?: string; en?: string } = { zh: title.zh.trim() };
  if (title.ja.trim()) out.ja = title.ja.trim();
  if (title.en.trim()) out.en = title.en.trim();
  return out;
}

/** desc — 全空 → undefined（与 schema partial.optional() 对齐） */
export function buildDesc(
  desc: ThemeEditorState['desc'],
): { zh?: string; ja?: string } | undefined {
  const zh = desc.zh.trim();
  const ja = desc.ja.trim();
  if (!zh && !ja) return undefined;
  const out: { zh?: string; ja?: string } = {};
  if (zh) out.zh = zh;
  if (ja) out.ja = ja;
  return out;
}
