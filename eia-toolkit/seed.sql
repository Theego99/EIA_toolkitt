-- ============================================================
-- EIA Toolkit — Seed Data
-- Creates one demo organization.
-- Run AFTER schema.sql.
--
-- Then create a user via Supabase Dashboard → Auth → Users →
-- "Invite user" with email: demo@eia-toolkit.jp
-- After they set their password, run the UPDATE below to
-- link them to this org.
-- ============================================================

-- 1. Create demo organization
INSERT INTO organizations (id, name, plan) VALUES
  ('00000000-0000-0000-0000-000000000001',
   '環境総合コンサルタント株式会社',
   'professional');

-- 2. After creating the user via Auth dashboard, get their UUID
--    and run this (replace the UUID):
--
-- INSERT INTO profiles (id, organization_id, name, role) VALUES
--   ('<USER_UUID_FROM_AUTH>',
--    '00000000-0000-0000-0000-000000000001',
--    '田中 誠一',
--    'pm');
--
-- Or if you want to invite users programmatically:
-- supabase.auth.admin.inviteUserByEmail('demo@eia-toolkit.jp', {
--   data: {
--     organization_id: '00000000-0000-0000-0000-000000000001',
--     name: '田中 誠一',
--     role: 'pm'
--   }
-- })
