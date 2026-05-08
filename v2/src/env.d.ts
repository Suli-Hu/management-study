/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

type Runtime = import('@astrojs/cloudflare').Runtime<import('./lib/db').Env>;

declare namespace App {
  interface Locals extends Runtime {
    user: import('./lib/auth').SessionUser | null;
    isAdmin: boolean;     // 兼容字段：true = super-admin（god mode，所有学科可写）
    isGuest: boolean;
    /** v0.12.0+: Canonical RBAC — per-discipline role derived from tenant_member (via tenant.discipline_key). */
    permissions: Map<string, 'owner' | 'editor' | 'viewer'>;
    /** super-admin（ADMIN_EMAILS env 命中），所有 discipline 自动 admin */
    isSuperAdmin: boolean;
    /** v0.4.33 邀请码登录的 guest（共用 INVITE_GUEST_EMAIL user）→ 全学科只读 */
    isInviteGuest: boolean;
    /** v0.5.96 API token 收窄 scope. null = 走 cookie session（不收窄）；
     *  [] = token 但无 scope 限制（=user 全权限）；非空数组 = 收窄到白名单 disciplines。 */
    apiTokenScopes: string[] | null;
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
