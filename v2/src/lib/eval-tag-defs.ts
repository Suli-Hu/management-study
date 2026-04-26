/**
 * 评价标签定义（义/限/例/应/用/喻）— 单一真相源
 *
 * 这 6 类是 KP body 末尾常见的"评价段落"语义。
 * 与学派 accent 无关，是固定的 6 色 tone。
 *
 * - glyph: 单字（也是 eval_content_json 的 key）
 * - name: 中文全称（UI 标签）
 * - matches: body 里可能出现的 label 别名（用于解析旧 body 末尾的 ◆XX— 段）
 * - tone: 视觉上每类自己的语义色（写死，不随 discipline 变）
 */
export type EvalGlyph = '义' | '限' | '例' | '应' | '用' | '喻';

export interface EvalTagDef {
  glyph: EvalGlyph;
  name: string;
  matches: string[];
  tone: string;
}

export const EVAL_TAG_DEFS: readonly EvalTagDef[] = [
  { glyph: '义', name: '意义', matches: ['意义', '義'],                     tone: '#34C759' },
  { glyph: '限', name: '局限', matches: ['局限', '周限', '限界', '限'],     tone: '#FF3B30' },
  { glyph: '例', name: '例子', matches: ['例子', '事例', '例'],             tone: '#FF9500' },
  { glyph: '应', name: '应对', matches: ['应对', '応対', '応'],             tone: '#007AFF' },
  { glyph: '用', name: '应用', matches: ['应用', '応用', '用'],             tone: '#5856D6' },
  { glyph: '喻', name: '比喻', matches: ['比喻', '喩'],                     tone: '#AF52DE' },
] as const;

export const EVAL_LABEL_WHITELIST = EVAL_TAG_DEFS.flatMap((d) => d.matches);
export const EVAL_GLYPHS: readonly EvalGlyph[] = EVAL_TAG_DEFS.map((d) => d.glyph);

/** 已结构化的评价内容：glyph → 文本（HTML 允许） */
export type EvalContent = Partial<Record<EvalGlyph, string>>;
