/**
 * D1 主表元数据 — 单一真源声明每个表的列集与主键。
 *
 * 设计意图：
 *   1. 主键列集只在这里声明一次。upsert SQL 的 ON CONFLICT 列从 pk 派生，
 *      不再可能与实际 PRIMARY KEY 错位（修 d1-view-write.ts ON CONFLICT(id) vs
 *      PRIMARY KEY (id, discipline) 这类 bug 的根因）。
 *   2. cols 数组顺序即 INSERT 列顺序，bind 时按 col 名取 row 值，
 *      消除"INSERT 列序与 .bind() 位置序错位"风险。
 *   3. tests/d1-pk-consistency.test.ts 会跑 migrations 用 sqlite_master 校验
 *      pk 与真实 SQLite PK 完全相等 — schema 改了代码没跟，CI fail。
 *
 * 仅覆盖 5 个业务"主表"。join 表（kp_school / kp_scholar / scholar_school）
 * 是 delete-then-insert 模式，不走 upsert，故不需要 TableMeta。
 */

export interface TableMeta<
  TPK extends readonly string[] = readonly string[],
  TCols extends readonly string[] = readonly string[],
> {
  readonly name: string;
  readonly pk: TPK;
  readonly cols: TCols;
}

export const KP_TABLE = {
  name: 'kp',
  pk: ['id'],
  cols: [
    'id',
    'discipline',
    'year',
    'title_zh',
    'title_en',
    'title_ja',
    'body_zh',
    'body_ja',
    'tags_json',
    'eval_content_zh_json',
    'eval_content_ja_json',
    'format',
    'created_at',
    'updated_at',
  ],
} as const satisfies TableMeta;

export const SCHOOL_TABLE = {
  name: 'school',
  pk: ['key'],
  cols: [
    'key',
    'discipline',
    'title_zh',
    'title_en',
    'title_ja',
    'era',
    'summary_zh',
    'summary_ja',
    'theme_key',
    'accent',
    'tags_json',
    'created_at',
    'updated_at',
  ],
} as const satisfies TableMeta;

export const SCHOLAR_TABLE = {
  name: 'scholar',
  // v0.6.8 (migration 0014): 复合 PK
  pk: ['discipline', 'key'],
  cols: [
    'key',
    'discipline',
    'name_zh',
    'name_en',
    'name_ja',
    'contribution_zh',
    'contribution_ja',
    'lifespan',
    'institution',
    'born',
    'died',
    'nationality',
    'flag',
    'origin',
    'field',
    'accent', // v0.5.0 起废弃但仍写空字符串占位（与 sync 脚本一致）
    'tags_json',
    'nobel_year',
    'nobel_detail',
    'created_at',
    'updated_at',
  ],
} as const satisfies TableMeta;

export const VIEW_TABLE = {
  name: 'view',
  // v0.5.66 (migration 0012): 复合 PK
  pk: ['id', 'discipline'],
  cols: [
    'id',
    'discipline',
    'name',
    'jp',
    'icon',
    'description',
    'flow',
    'scope',
    'kind',
    'is_default',
    'position',
    'groups_json',
    'created_at',
    'updated_at',
  ],
} as const satisfies TableMeta;

export const DISCIPLINE_TABLE = {
  name: 'discipline',
  pk: ['key'],
  cols: [
    'key',
    'title_zh',
    'title_en',
    'title_ja',
    'tagline_zh',
    'tagline_ja',
    'accent',
    'tags_json',
    'themes_json',
    'created_at',
    'updated_at',
  ],
} as const satisfies TableMeta;

export const ALL_TABLES = [
  KP_TABLE,
  SCHOOL_TABLE,
  SCHOLAR_TABLE,
  VIEW_TABLE,
  DISCIPLINE_TABLE,
] as const;
