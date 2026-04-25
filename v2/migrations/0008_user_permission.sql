-- v0.4.25 RBAC：per-discipline 用户权限（admin = 写, guest = 只读）
--
-- super-admin（ADMIN_EMAILS env 命中）跳过此表查询，自动获得所有 discipline 的 admin。
-- 其他 user 凭 (user_id, discipline_key) 在此表的行决定权限：
--   - 行 role='admin'  → 该学科可写
--   - 行 role='guest'  → 该学科只读
--   - 无行            → 该学科无权限（首页学科卡片灰锁）
--
-- 加白工作流：super-admin 跟 AI 对话时给 email + discipline + role，
-- AI 跑：INSERT INTO user_permission (user_id, discipline_key, role, granted_at, granted_by) VALUES (...)
CREATE TABLE user_permission (
  user_id        TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  discipline_key TEXT NOT NULL REFERENCES discipline(key) ON DELETE CASCADE,
  role           TEXT NOT NULL CHECK (role IN ('admin', 'guest')),
  granted_at     TEXT NOT NULL,
  granted_by     TEXT,
  PRIMARY KEY (user_id, discipline_key)
);
CREATE INDEX idx_user_permission_by_user ON user_permission(user_id);
