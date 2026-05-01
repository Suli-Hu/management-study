-- ============================================================
-- Migration 0014 — API-first multi-tenant foundation
--
-- discipline remains the public product concept. tenant is the
-- canonical isolation boundary for API-first writes, with one tenant
-- per discipline during the migration.
-- ============================================================

PRAGMA foreign_keys = ON;

CREATE TABLE tenant (
  id                 TEXT PRIMARY KEY,
  discipline_key     TEXT NOT NULL UNIQUE REFERENCES discipline(key) ON DELETE CASCADE,
  title_zh           TEXT NOT NULL,
  title_en           TEXT,
  title_ja           TEXT,
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL
);

INSERT INTO tenant (id, discipline_key, title_zh, title_en, title_ja, created_at, updated_at)
SELECT key, key, title_zh, title_en, title_ja, created_at, updated_at
FROM discipline;

CREATE TABLE tenant_member (
  tenant_id          TEXT NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  user_id            TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  role               TEXT NOT NULL CHECK (role IN ('owner', 'editor', 'viewer')),
  created_at         TEXT NOT NULL,
  created_by         TEXT,
  PRIMARY KEY (tenant_id, user_id)
);
CREATE INDEX idx_tenant_member_user ON tenant_member(user_id);

INSERT INTO tenant_member (tenant_id, user_id, role, created_at, created_by)
SELECT discipline_key, user_id,
       CASE role WHEN 'admin' THEN 'editor' ELSE 'viewer' END,
       granted_at, granted_by
FROM user_permission;

ALTER TABLE kp ADD COLUMN tenant_id TEXT;
ALTER TABLE kp ADD COLUMN created_by TEXT REFERENCES user(id) ON DELETE SET NULL;
ALTER TABLE kp ADD COLUMN updated_by TEXT REFERENCES user(id) ON DELETE SET NULL;
ALTER TABLE kp ADD COLUMN deleted_at TEXT;

UPDATE kp SET tenant_id = discipline WHERE tenant_id IS NULL;

CREATE INDEX idx_kp_tenant ON kp(tenant_id);
CREATE INDEX idx_kp_tenant_updated ON kp(tenant_id, updated_at);

CREATE TABLE knowledge_point_versions (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  kp_id              TEXT NOT NULL,
  tenant_id          TEXT NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  version            INTEGER NOT NULL,
  snapshot_json      TEXT NOT NULL,
  edited_by          TEXT REFERENCES user(id) ON DELETE SET NULL,
  created_at         TEXT NOT NULL,
  UNIQUE (kp_id, version)
);
CREATE INDEX idx_kp_versions_kp ON knowledge_point_versions(kp_id, version DESC);
