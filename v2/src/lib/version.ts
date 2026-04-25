/**
 * 版本号 — footer 显示用，便于线上验证 deploy 是否到位。
 *
 * APP_VERSION：从 package.json 自动读取，bump version 时只改一处（v0.4.2 起改自动）。
 * GIT_SHA：构建时从 PUBLIC_GIT_SHA 注入（见 .github/workflows/deploy-v2.yml）。
 *   本地 dev 时为 'local'。
 */
import pkg from '../../package.json';
export const APP_VERSION = pkg.version;

const rawSha = import.meta.env.PUBLIC_GIT_SHA ?? 'local';
export const GIT_SHA = rawSha.slice(0, 7);
