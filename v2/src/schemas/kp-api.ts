import { z } from 'zod';
import { BilingualBody, I18nString } from './i18n';
import { KpId, SchoolKey, ScholarKey } from './kp';

export const KpFormat = z.enum(['narrative', 'flat-list', 'accordion', 'compare', 'quad']);

export const KpCreateInput = z.object({
  id: KpId.optional(),
  title: I18nString,
  body: BilingualBody,
  format: KpFormat.default('narrative'),
  year: z.string().trim().default(''),
  schools: z.array(SchoolKey).min(1, 'KP 至少属于一个学派'),
  scholars: z.array(ScholarKey).default([]),
  tags: z.array(z.string()).default([]),
  evalContent: z.object({
    zh: z.record(z.string()).optional(),
    ja: z.record(z.string()).optional(),
  }).strict().optional(),
}).strict();

export const KpPatchInput = KpCreateInput.omit({ id: true }).partial().refine(
  (value) => Object.keys(value).length > 0,
  'PATCH 至少需要一个字段',
);

export type KpCreateInput = z.infer<typeof KpCreateInput>;
export type KpPatchInput = z.infer<typeof KpPatchInput>;
