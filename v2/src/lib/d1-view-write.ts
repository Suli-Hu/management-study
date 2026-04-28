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

type ParsedView = z.infer<typeof View>;

export async function upsertViewInD1(
  db: D1Database,
  view: ParsedView,
): Promise<void> {
  await db.prepare(
    `INSERT INTO view (
      id, discipline, name, jp, icon, description, flow,
      scope, kind, is_default, position, groups_json,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      discipline = excluded.discipline,
      name = excluded.name,
      jp = excluded.jp,
      icon = excluded.icon,
      description = excluded.description,
      flow = excluded.flow,
      scope = excluded.scope,
      kind = excluded.kind,
      is_default = excluded.is_default,
      position = excluded.position,
      groups_json = excluded.groups_json,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at`,
  ).bind(
    view.id,
    view.discipline,
    view.name,
    view.jp ?? '',
    view.icon,
    view.description ?? '',
    view.flow ?? '',
    view.scope,
    view.kind,
    view.isDefault ? 1 : 0,
    view.position,
    JSON.stringify(view.groups ?? []),
    view.createdAt,
    view.updatedAt,
  ).run();
}

export async function deleteViewInD1(
  db: D1Database,
  viewId: string,
): Promise<void> {
  await db.prepare('DELETE FROM view WHERE id = ?').bind(viewId).run();
}
