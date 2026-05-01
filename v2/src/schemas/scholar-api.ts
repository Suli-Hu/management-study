import { z } from 'zod';
import { BilingualBody, I18nString } from './i18n';
import { KpId, ScholarKey, SchoolKey } from './kp';

export const ScholarCreateInput = z.object({
  key: ScholarKey,
  name: I18nString,
  schools: z.array(SchoolKey).default([]),
  contribution: BilingualBody,
  lifespan: z.string().trim().default(''),
  institution: z.string().trim().default(''),
  born: z.string().trim().default(''),
  died: z.string().trim().default(''),
  nationality: z.string().trim().default(''),
  flag: z.string().trim().default(''),
  origin: z.string().trim().default(''),
  field: z.string().trim().default(''),
  tags: z.array(z.string()).default([]),
  nobel: z.object({
    year: z.string(),
    detail: z.string(),
  }).nullable().default(null),
  kpsOrder: z.array(KpId).default([]),
}).strict();

export const ScholarPatchInput = ScholarCreateInput.omit({ key: true }).partial().refine(
  (value) => Object.keys(value).length > 0,
  'PATCH 至少需要一个字段',
);

export type ScholarCreateInput = z.infer<typeof ScholarCreateInput>;
export type ScholarPatchInput = z.infer<typeof ScholarPatchInput>;
