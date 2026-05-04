/**
 * View 直写 D1 (v0.5.93)
 *
 * View 没 join 表，groups[] 整体存 groups_json 列。
 *
 * 删除：
 *   - 调用方先验"该 discipline 删完是否仍有至少 1 个 isDefault=true"
 *     （v0.5.66 设计：每 discipline 至少一个默认视图）
 *   - 不允许删 isDefault=true 的视图（要先 promote 另一个）
 */

import type { z } from 'zod';
import type { View } from '~/schemas/view';
import { VIEW_TABLE } from './d1-tables';
import { buildUpsertStmt } from './d1-upsert';
import { deepStripStrong } from './sanitize-strong';

type ParsedView = z.infer<typeof View>;

export async function upsertViewInD1(
  db: D1Database,
  view: ParsedView,
): Promise<void> {
  // v0.8.7 sanitize: 静默 strip 所有 <strong>/</strong>。见 migration-v0.8.md §11.
  view = deepStripStrong(view);

  await buildUpsertStmt(db, VIEW_TABLE, {
    id: view.id,
    discipline: view.discipline,
    name: view.name,
    jp: view.jp ?? '',
    icon: view.icon,
    description: view.description ?? '',
    flow: view.flow ?? '',
    scope: view.scope,
    kind: view.kind,
    is_default: view.isDefault ? 1 : 0,
    position: view.position,
    groups_json: JSON.stringify(view.groups ?? []),
    created_at: view.createdAt,
    updated_at: view.updatedAt,
  }).run();
}

export async function deleteViewInD1(
  db: D1Database,
  viewId: string,
): Promise<void> {
  await db.prepare('DELETE FROM view WHERE id = ?').bind(viewId).run();
}
