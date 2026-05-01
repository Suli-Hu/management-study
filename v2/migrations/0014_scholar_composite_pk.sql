-- v0.6.8 — scholar PK 改 (discipline, key) 复合主键
--
-- 动机：marketing 老师推 92 KP 时引用 6 个 scholar key (kotler/porter/...) 跟 keiei
--   重名 → tests/data.test.ts:56 unique 校验失败 → deploy 阻塞 1.5+ 小时。
--   设计本意是"学科之间数据隔离，重名也是各是各的"，所以 scholar 应当按
--   (discipline, key) 复合 PK 组织，不是全局 key 唯一。
--
-- 影响表：
--   1. scholar          — PK 从 key 改为 (discipline, key)
--   2. kp_scholar       — 加 scholar_discipline 列，PK 改为 (kp_id, scholar_discipline, scholar_key)
--   3. scholar_school   — 加 scholar_discipline 列，PK 改为 (scholar_discipline, scholar_key, school_key)
--
-- 不影响：school / kp / view 表（school + kp 跨学科无重名，没有同样的紧迫性；
--   暂不强行同步改造，避免无关 risk。后续如有需要再单开 PR）。
--
-- 数据迁移策略：
--   - scholar：直接 INSERT SELECT 全量 copy（key 单值 → 仍唯一只是 PK 范围扩大）
--   - kp_scholar / scholar_school：scholar_discipline 从 JOIN scholar 推断（迁移
--     执行时 scholar 表已经是新 schema 但数据仍是单 discipline-per-key 的旧状态，
--     JOIN ON scholar.key = old_join.scholar_key 唯一对应，无歧义）
--
-- 安全性：
--   - SQLite 不支持 ALTER TABLE PRIMARY KEY，必须 CREATE new + INSERT + DROP + RENAME
--   - 跑前后 row count 应保持一致（migration 末尾不做断言，由 sync-to-d1 wipe-reload 兜底）
--   - PRAGMA foreign_keys 在 D1 默认 OFF，FK 是 informational 不强 enforce

-- ============================================================
-- 1. scholar 主表 — PK (discipline, key) 复合
-- ============================================================

CREATE TABLE scholar_new (
  key                TEXT NOT NULL,
  discipline         TEXT NOT NULL REFERENCES discipline(key),
  name_zh            TEXT NOT NULL,
  name_en            TEXT,
  name_ja            TEXT,
  contribution_zh    TEXT NOT NULL DEFAULT '',
  contribution_ja    TEXT,
  lifespan           TEXT NOT NULL DEFAULT '',
  institution        TEXT NOT NULL DEFAULT '',
  nobel_year         TEXT,
  nobel_detail       TEXT,
  born               TEXT,
  died               TEXT,
  nationality        TEXT,
  flag               TEXT,
  origin             TEXT,
  field              TEXT,
  accent             TEXT,
  tags_json          TEXT NOT NULL DEFAULT '[]',
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL,
  PRIMARY KEY (discipline, key)
);

INSERT INTO scholar_new (
  key, discipline, name_zh, name_en, name_ja,
  contribution_zh, contribution_ja, lifespan, institution,
  nobel_year, nobel_detail,
  born, died, nationality, flag, origin, field, accent,
  tags_json, created_at, updated_at
)
SELECT
  key, discipline, name_zh, name_en, name_ja,
  contribution_zh, contribution_ja, lifespan, institution,
  nobel_year, nobel_detail,
  born, died, nationality, flag, origin, field, accent,
  tags_json, created_at, updated_at
FROM scholar;

DROP INDEX IF EXISTS idx_scholar_discipline;
DROP TABLE scholar;
ALTER TABLE scholar_new RENAME TO scholar;
CREATE INDEX idx_scholar_discipline ON scholar(discipline);

-- ============================================================
-- 2. kp_scholar — 加 scholar_discipline 列 + PK 复合
-- ============================================================

CREATE TABLE kp_scholar_new (
  kp_id              TEXT NOT NULL,
  scholar_discipline TEXT NOT NULL,
  scholar_key        TEXT NOT NULL,
  position           INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (kp_id, scholar_discipline, scholar_key)
);

-- 老 kp_scholar 的 scholar_key 引用全局唯一 scholar.key — JOIN scholar (新表) 拿 discipline
-- 注意：因为之前 scholar.key 全局唯一，老数据 JOIN 之后 scholar_discipline 唯一确定。
INSERT INTO kp_scholar_new (kp_id, scholar_discipline, scholar_key, position)
SELECT ks.kp_id, s.discipline, ks.scholar_key, ks.position
FROM kp_scholar ks
JOIN scholar s ON ks.scholar_key = s.key;

DROP INDEX IF EXISTS idx_kp_scholar_by_scholar;
DROP TABLE kp_scholar;
ALTER TABLE kp_scholar_new RENAME TO kp_scholar;
CREATE INDEX idx_kp_scholar_by_scholar ON kp_scholar(scholar_discipline, scholar_key);

-- ============================================================
-- 3. scholar_school — 加 scholar_discipline 列 + PK 复合
-- ============================================================

CREATE TABLE scholar_school_new (
  scholar_discipline TEXT NOT NULL,
  scholar_key        TEXT NOT NULL,
  school_key         TEXT NOT NULL,
  position           INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (scholar_discipline, scholar_key, school_key)
);

INSERT INTO scholar_school_new (scholar_discipline, scholar_key, school_key, position)
SELECT s.discipline, ss.scholar_key, ss.school_key, ss.position
FROM scholar_school ss
JOIN scholar s ON ss.scholar_key = s.key;

DROP INDEX IF EXISTS idx_scholar_school_by_school;
DROP TABLE scholar_school;
ALTER TABLE scholar_school_new RENAME TO scholar_school;
CREATE INDEX idx_scholar_school_by_school ON scholar_school(school_key);
