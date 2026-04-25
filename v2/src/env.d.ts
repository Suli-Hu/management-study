/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

type Runtime = import('@astrojs/cloudflare').Runtime<import('./lib/db').Env>;

declare namespace App {
  interface Locals extends Runtime {
    user: import('./lib/auth').SessionUser | null;
    isAdmin: boolean;     // 兼容字段：true = super-admin（god mode，所有学科可写）
    isGuest: boolean;
    /** v0.4.25 RBAC: 该 user 在每个 discipline 的角色。super-admin 不在此 map（用 isSuperAdmin 判定） */
    permissions: Map<string, 'admin' | 'guest'>;
    /** super-admin（ADMIN_EMAILS env 命中），所有 discipline 自动 admin */
    isSuperAdmin: boolean;
    /** 该 user 是否能写指定 discipline（super-admin 永远 true）。undefined 时安全返 false。 */
    canEdit: (discipline: string | undefined) => boolean;
    /** 该 user 是否能读指定 discipline。undefined 时安全返 false。 */
    canRead: (discipline: string | undefined) => boolean;
  }
}

interface ImportMetaEnv {
  readonly PUBLIC_GIT_SHA?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
