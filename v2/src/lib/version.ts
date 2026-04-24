/**
 * 版本号 — footer 显示用，便于线上验证 deploy 是否到位。
 *
 * APP_VERSION：手动 bump，对应 W 编号（W2.5 → 0.2.5、W3.1 → 0.3.1）。
 * GIT_SHA：构建时从 PUBLIC_GIT_SHA 注入（见 .github/workflows/deploy-v2.yml）。
 *   本地 dev 时为 'local'。
 */
export const APP_VERSION = '0.3.4';

const rawSha = import.meta.env.PUBLIC_GIT_SHA ?? 'local';
export const GIT_SHA = rawSha.slice(0, 7);
