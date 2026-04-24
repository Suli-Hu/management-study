/**
 * Schema entry point — 所有数据校验从这里 import。
 *
 * 用法：
 *   import { Kp, School, Scholar, Discipline } from '~/schemas';
 *   const result = Kp.safeParse(jsonData);
 *   if (!result.success) console.error(result.error.issues);
 */

export * from './i18n';
export * from './kp';
export * from './school';
export * from './scholar';
export * from './discipline';
