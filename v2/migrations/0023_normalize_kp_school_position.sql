-- v0.11.1 Stage 1: 规范化 kp_school.position 为单一段位 0..N-1
-- 详见 v2/docs/KP-SCHOOL-POSITION-UNIFY-PRD.md §5
--
-- 现状：position 字段被切两段（< 1000 = 学派拖拽 / >= 1000 = KP 自声明），导致
-- KP PATCH 全删时误伤拖拽顺序行（4C 改名后顺序丢失事故）。
-- 本 migration 跑完后：position 在每个 school_key 内连续 0..N-1，显示顺序不变。
--
-- 算法：每个 school_key 内按 (position ASC, kp_id ASC) 重新打号 0..N-1。
-- 因为按"当前 position ASC"排序，结果正好是用户当前看到的顺序。
--
-- 幂等：跑第二次结果不变（数据已规范化）。
-- 性能：~几百行毫秒级，可在线跑。
--
-- 同步代码改动：
--   Stage 2 (v0.11.2): school-api-store.ts patchSchoolRecord 改 UPDATE-only
--   Stage 3 (v0.11.3): kp-api-store.ts patchKpRecord 改 delta 模式
--   Stage 4 (v0.11.4): kp_scholar 表同款防御性修复

WITH ranked AS (
  SELECT
    kp_id,
    school_key,
    ROW_NUMBER() OVER (
      PARTITION BY school_key
      ORDER BY position ASC, kp_id ASC
    ) - 1 AS new_position
  FROM kp_school
)
UPDATE kp_school
SET position = (
  SELECT new_position
  FROM ranked
  WHERE ranked.kp_id = kp_school.kp_id
    AND ranked.school_key = kp_school.school_key
);
