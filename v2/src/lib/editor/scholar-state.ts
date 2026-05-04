/**
 * Scholar editor v0.8 — EditorState shape + EditorStore
 *
 * 4 sections: 基本信息 / 学术身份 / 生平 / 关联
 * D6=B 不暴露 kpsOrder（自动从 KP.scholars[] 反向派生 + 字典序）
 *
 * 见 v2/docs/SCHOOL-SCHOLAR-THEME-EDITOR-V0.8-PRD.md §5.2
 */

import type { SaveStatus, ErrorDetail } from './school-state';
export type { SaveStatus, ErrorDetail } from './school-state';

export interface NobelData {
  year: string;
  detail: string;
}

export interface ScholarEditorState {
  key: string | null;
  discipline: string;
  name: { zh: string; ja: string; en: string };

  // 学术身份
  schools: string[];
  contribution: { zh: string; ja: string };
  field: string;
  institution: string;

  // 生平
  lifespan: string;
  born: string;
  died: string;
  nationality: string;
  flag: string;
  origin: string;

  // 关联
  tags: string[];
  nobel: NobelData | null;

  isDirty: boolean;
  saveStatus: SaveStatus;
  errorDetail: ErrorDetail | null;
}

export interface ScholarEditorMetadata {
  schools: Array<{ key: string; label: string }>;
  tags: Array<{ key: string; label: string; color: string | null }>;
  disciplineLabel: string;
  disciplineKey: string;
  fromPath: string;
  fromLabel: string;
}

// ============================================================
// Initial state factories
// ============================================================

export function makeNewScholarState(
  discipline: string,
  presetSchool = '',
): ScholarEditorState {
  return {
    key: null,
    discipline,
    name: { zh: '', ja: '', en: '' },
    schools: presetSchool ? [presetSchool] : [],
    contribution: { zh: '', ja: '' },
    field: '',
    institution: '',
    lifespan: '',
    born: '',
    died: '',
    nationality: '',
    flag: '',
    origin: '',
    tags: [],
    nobel: null,
    isDirty: false,
    saveStatus: 'idle',
    errorDetail: null,
  };
}

export interface ExistingScholarInit {
  key: string;
  discipline: string;
  name: { zh: string; ja?: string; en?: string };
  schools: string[];
  contribution: { zh: string; ja?: string };
  lifespan: string;
  institution: string;
  born: string;
  died: string;
  nationality: string;
  flag: string;
  origin: string;
  field: string;
  tags: string[];
  nobel: { year: string; detail: string } | null;
}

export function makeEditingScholarState(init: ExistingScholarInit): ScholarEditorState {
  return {
    key: init.key,
    discipline: init.discipline,
    name: {
      zh: init.name.zh ?? '',
      ja: init.name.ja ?? '',
      en: init.name.en ?? '',
    },
    schools: [...(init.schools ?? [])],
    contribution: {
      zh: init.contribution.zh ?? '',
      ja: init.contribution.ja ?? '',
    },
    field: init.field ?? '',
    institution: init.institution ?? '',
    lifespan: init.lifespan ?? '',
    born: init.born ?? '',
    died: init.died ?? '',
    nationality: init.nationality ?? '',
    flag: init.flag ?? '',
    origin: init.origin ?? '',
    tags: [...(init.tags ?? [])],
    nobel: init.nobel ? { year: init.nobel.year, detail: init.nobel.detail } : null,
    isDirty: false,
    saveStatus: 'idle',
    errorDetail: null,
  };
}

// ============================================================
// Store
// ============================================================

export type Listener = (state: ScholarEditorState) => void;

export class ScholarEditorStore {
  private state: ScholarEditorState;
  private listeners: Set<Listener> = new Set();

  constructor(initial: ScholarEditorState) {
    this.state = initial;
  }

  get(): ScholarEditorState {
    return this.state;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  update(patch: Partial<ScholarEditorState>, markDirty = true): void {
    const next: ScholarEditorState = { ...this.state, ...patch };
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

export function buildI18nName(
  name: ScholarEditorState['name'],
): { zh: string; ja?: string; en?: string } {
  const out: { zh: string; ja?: string; en?: string } = { zh: name.zh.trim() };
  if (name.ja.trim()) out.ja = name.ja.trim();
  if (name.en.trim()) out.en = name.en.trim();
  return out;
}

export function buildContribution(
  contribution: ScholarEditorState['contribution'],
): { zh: string; ja?: string } {
  const out: { zh: string; ja?: string } = { zh: contribution.zh };
  if (contribution.ja.trim()) out.ja = contribution.ja;
  return out;
}

/** nobel 任一字段非空 → 视为有效（year 是主字段，year 必须存在 + 非空才送） */
export function nobelHasContent(nobel: NobelData | null): boolean {
  if (!nobel) return false;
  return nobel.year.trim().length > 0;
}
