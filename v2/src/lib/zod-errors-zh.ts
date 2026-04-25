/**
 * zod issues → 中文人话（v0.4.22 Pack C M4）
 *
 * 后端 422 schema_invalid 时返 { ok:false, reason:'schema_invalid', detail: zodIssues[] }。
 * 前端用 formatZodIssues(detail) 转成 ["中文标题: 必填", "出生年: 必填"] 这样的字符串列表。
 *
 * path 映射只列 KP/学者/学派编辑器实际涉及的字段。新字段加进 PATH_LABELS 即可。
 */

const PATH_LABELS: Record<string, string> = {
  // 顶层 key
  key: 'key（不可改）',
  id: 'id',
  discipline: '学科',

  // i18n 名称
  'title.zh': '中文标题',
  'title.en': '英文标题',
  'title.ja': '日文标题',
  'name.zh': '中文姓名',
  'name.en': '英文姓名',
  'name.ja': '日文姓名',

  // 正文
  'body.zh': '中文正文',
  'body.ja': '日文正文',
  'summary.zh': '中文概述',
  'summary.ja': '日文概述',
  'contribution.zh': '贡献（中文）',
  'contribution.ja': '贡献（日文）',

  // 学派
  themeKey: '主题分组',
  accent: 'accent',
  era: '时代',
  concepts: '核心概念列表',

  // 学者
  schools: '所属学派',
  born: '出生年',
  died: '卒年',
  nationality: '国籍',
  flag: '国旗',
  origin: '出生地',
  field: '研究领域',
  institution: '代表机构',
  lifespan: '生卒年',
  'nobel.year': '诺贝尔奖年份',
  'nobel.detail': '诺贝尔奖详情',

  // KP
  scholars: '学者列表',
  year: '年份',
  tags: '标签',
  format: '版式',

  createdAt: 'createdAt（自动）',
  updatedAt: 'updatedAt（自动）',
};

interface ZodIssue {
  code?: string;
  path?: (string | number)[];
  message?: string;
  expected?: string;
  received?: string;
  minimum?: number;
  type?: string;
}

function pathLabel(path: (string | number)[]): string {
  if (!path?.length) return '(根)';
  // 用 . 拼路径；数组下标保留为 [n]
  const joined = path
    .map((p, i) => (typeof p === 'number' ? `[${p}]` : (i === 0 ? p : `.${p}`)))
    .join('');
  return PATH_LABELS[joined] ?? joined;
}

function codeLabel(issue: ZodIssue): string {
  const c = issue.code;
  if (c === 'invalid_type' && issue.received === 'undefined') return '必填';
  if (c === 'invalid_type') return `类型错（应为 ${issue.expected}，收到 ${issue.received}）`;
  if (c === 'too_small' && issue.type === 'string' && issue.minimum === 1) return '不能为空';
  if (c === 'too_small') return `太短（最少 ${issue.minimum}）`;
  if (c === 'invalid_string') return '格式不对';
  if (c === 'invalid_enum_value') return '不在允许的枚举值里';
  if (c === 'unrecognized_keys') return '出现 schema 未声明的字段';
  return issue.message ?? '不通过';
}

/**
 * 把 zod issues 数组翻译成中文 ["字段: 原因", ...]，最多 limit 条避免对话框炸长
 */
export function formatZodIssues(issues: unknown, limit = 5): string[] {
  if (!Array.isArray(issues)) return [];
  const arr = issues as ZodIssue[];
  const lines = arr.slice(0, limit).map((i) => `${pathLabel(i.path ?? [])}: ${codeLabel(i)}`);
  if (arr.length > limit) lines.push(`... 还有 ${arr.length - limit} 项`);
  return lines;
}
