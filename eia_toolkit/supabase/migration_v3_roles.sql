-- ============================================================================
-- EIA Toolkit — Migration v3: 役割ベースRLS（Flutter/React共通）
-- Supabase Dashboard → SQL Editor で実行
--
-- 前提: schema.sql + migration_v2.sql 適用済み
-- 役割: admin / pm / surveyor / viewer
-- ============================================================================

-- ── ヘルパー関数 ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION my_role() RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION my_org() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT organization_id FROM profiles WHERE id = auth.uid();
$$;

-- ── projects: 役割ベースのRLS ─────────────────────────────────────────────
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "projects_select" ON projects;
DROP POLICY IF EXISTS "projects_insert" ON projects;
DROP POLICY IF EXISTS "projects_update" ON projects;
DROP POLICY IF EXISTS "projects_delete" ON projects;

-- 閲覧: 同一組織の全員
CREATE POLICY "projects_select" ON projects FOR SELECT
  USING (organization_id = my_org());

-- 作成: admin / pm のみ
CREATE POLICY "projects_insert" ON projects FOR INSERT
  WITH CHECK (
    organization_id = my_org()
    AND my_role() IN ('admin', 'pm')
  );

-- 更新: admin / pm / surveyor（調査員は現場データ更新のため必要）
-- viewer は更新不可
CREATE POLICY "projects_update" ON projects FOR UPDATE
  USING (organization_id = my_org() AND my_role() IN ('admin','pm','surveyor'))
  WITH CHECK (organization_id = my_org());

-- 削除: admin / pm のみ
CREATE POLICY "projects_delete" ON projects FOR DELETE
  USING (organization_id = my_org() AND my_role() IN ('admin','pm'));

-- ── profiles: 役割管理 ────────────────────────────────────────────────────
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select" ON profiles;
DROP POLICY IF EXISTS "profiles_update_self" ON profiles;
DROP POLICY IF EXISTS "profiles_update_admin" ON profiles;

-- 閲覧: 同一組織の全員
CREATE POLICY "profiles_select" ON profiles FOR SELECT
  USING (organization_id = my_org() OR id = auth.uid());

-- 自分の名前等は本人が更新可
CREATE POLICY "profiles_update_self" ON profiles FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- 役割変更を含む他メンバーの更新は admin のみ
CREATE POLICY "profiles_update_admin" ON profiles FOR UPDATE
  USING (organization_id = my_org() AND my_role() = 'admin')
  WITH CHECK (organization_id = my_org());

-- ── organizations ────────────────────────────────────────────────────────
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_select" ON organizations;
DROP POLICY IF EXISTS "org_update" ON organizations;

CREATE POLICY "org_select" ON organizations FOR SELECT
  USING (id = my_org());

CREATE POLICY "org_update" ON organizations FOR UPDATE
  USING (id = my_org() AND my_role() = 'admin')
  WITH CHECK (id = my_org());

-- ── Storage: project-docs バケット ────────────────────────────────────────
-- viewer以外はアップロード可、全員閲覧可（組織内）
-- Storageポリシーはダッシュボード → Storage → project-docs → Policies で:
--   SELECT: authenticated
--   INSERT: authenticated（アプリ側で役割チェック済み）
--   DELETE: authenticated

-- ── 確認クエリ ────────────────────────────────────────────────────────────
-- SELECT * FROM pg_policies WHERE tablename IN ('projects','profiles','organizations');
