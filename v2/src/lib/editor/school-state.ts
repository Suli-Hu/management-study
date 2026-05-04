/**
 * School editor v0.8 — EditorState shape + EditorStore
 *
 * Mirror KP editor `state.ts` — vanilla TS state container with shallow subscribers.
 * 见 v2/docs/SCHOOL-SCHOLAR-THEME-EDITOR-V0.8-PRD.md §5.1
 */

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export interface ErrorDetail {
  reason: string;
  message: string;
  field?: string;
}

export interface SchoolEditorState {
  /** new 模式 = null（form 内 input 是 typed key）；edit 模式 = 已有 key（readonly） */
  key: string | null;
  discipline: string;
  title: { zh: string; ja: string; en: string };
  era: string;
  summary: { zh: string; ja: string };
  themeKey: string;
  tags: string[];

  isDirty: boolean;
  saveStatus: SaveStatus;
  errorDetail: ErrorDetail | null;
}

export interface SchoolEditorMetadata {
  themes: Array<{ key: string; label: string }>;
  tags: Array<{ key: string; label: string; color: string | null }>;
  disciplineLabel: string;
  disciplineKey: string;
  fromPath: string;
  fromLabel: string;
}

// ============================================================
// Initial state factories
// ============================================================

export function makeNewSchoolState(discipline: string, presetThemeKey = ''): SchoolEditorState {
  return {
    key: null,
    discipline,
    title: { zh: '', ja: '', en: '' },
    era: '',
    summary: { zh: '', ja: '' },
    themeKey: presetThemeKey,
    tags: [],
    isDirty: false,
    saveStatus: 'idle',
    errorDetail: null,
  };
}

export interface ExistingSchoolInit {
  key: string;
  discipline: string;
  title: { zh: string; ja?: string; en?: string };
  era: string;
  summary: { zh: string; ja?: string };
  themeKey: string;
  tags: string[];
}

export function makeEditingSchoolState(init: ExistingSchoolInit): SchoolEditorState {
  return {
    key: init.key,
    discipline: init.discipline,
    title: {
      zh: init.title.zh ?? '',
      ja: init.title.ja ?? '',
      en: init.title.en ?? '',
    },
    era: init.era ?? '',
    summary: {
      zh: init.summary.zh ?? '',
      ja: init.summary.ja ?? '',
    },
    themeKey: init.themeKey ?? '',
    tags: [...(init.tags ?? [])],
    isDirty: false,
    saveStatus: 'idle',
    errorDetail: null,
  };
}

// ============================================================
// Store with shallow subscriber
// ============================================================

export type Listener = (state: SchoolEditorState) => void;

export class SchoolEditorStore {
  private state: SchoolEditorState;
  private listeners: Set<Listener> = new Set();

  constructor(initial: SchoolEditorState) {
    this.state = initial;
  }

  get(): SchoolEditorState {
    return this.state;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  update(patch: Partial<SchoolEditorState>, markDirty = true): void {
    const next: SchoolEditorState = { ...this.state, ...patch };
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

/** title.{zh, ja?, en?} — 去掉空字符串字段 */
export function buildI18nTitle(title: SchoolEditorState['title']): { zh: string; ja?: string; en?: string } {
  const out: { zh: string; ja?: string; en?: string } = { zh: title.zh.trim() };
  if (title.ja.trim()) out.ja = title.ja.trim();
  if (title.en.trim()) out.en = title.en.trim();
  return out;
}

/** summary.{zh, ja?} — ja 空则不送 */
export function buildSummary(summary: SchoolEditorState['summary']): { zh: string; ja?: string } {
  const out: { zh: string; ja?: string } = { zh: summary.zh };
  if (summary.ja.trim()) out.ja = summary.ja;
  return out;
}
