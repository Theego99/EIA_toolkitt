-- ============================================================
-- EIA Toolkit — Supabase Schema
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- ── EXTENSIONS ────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── ORGANIZATIONS (tenants) ───────────────────────────────
CREATE TABLE organizations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  plan        text NOT NULL DEFAULT 'starter'
              CHECK (plan IN ('starter', 'professional', 'enterprise')),
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ── PROFILES (extends auth.users) ────────────────────────
-- One row per user, linked to an organization.
CREATE TABLE profiles (
  id              uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            text,
  role            text NOT NULL DEFAULT 'surveyor'
                  CHECK (role IN ('admin','pm','surveyor','author','client','reviewer')),
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Auto-create profile row when new user signs up
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- org_id and role can be passed via user metadata at sign-up time
  INSERT INTO profiles (id, organization_id, name, role)
  VALUES (
    NEW.id,
    COALESCE((NEW.raw_user_meta_data->>'organization_id')::uuid, NULL),
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.email),
    COALESCE(NEW.raw_user_meta_data->>'role', 'pm')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ── PROJECTS ──────────────────────────────────────────────
CREATE TABLE projects (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            text NOT NULL,
  client          text,
  type            text DEFAULT 'wind',
  stage           integer NOT NULL DEFAULT 1 CHECK (stage BETWEEN 1 AND 7),
  pref            text DEFAULT '東京都',
  deadline        date,
  area            text,
  budget          text,
  description     text,
  manager         text,
  risk            text DEFAULT 'low' CHECK (risk IN ('low','medium','high')),
  progress        integer DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  red_list_count  integer DEFAULT 0,
  -- Tasks stored as JSONB keyed by stage: {"1": [{id, label, done}], "2": [...]}
  tasks           jsonb NOT NULL DEFAULT '{}',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ── SPECIES ───────────────────────────────────────────────
CREATE TABLE species (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name        text NOT NULL,               -- 和名
  latin       text,                        -- 学名
  type        text DEFAULT '植物',          -- 分類群
  status      text DEFAULT 'LC'
              CHECK (status IN ('CR','EN','VU','NT','LC','EX')),
  protected   boolean NOT NULL DEFAULT false,
  count       integer DEFAULT 1,
  location    text,
  obs_date    date,
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ── COMMENTS ─────────────────────────────────────────────
CREATE TABLE comments (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  author_id    uuid REFERENCES profiles(id) ON DELETE SET NULL,
  author_name  text NOT NULL,
  role         text NOT NULL DEFAULT 'pm',
  body         text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- ── DOCUMENTS (metadata; files in Supabase Storage) ──────
CREATE TABLE documents (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name         text NOT NULL,
  storage_path text,          -- path in Supabase Storage bucket
  file_size    text,
  status       text DEFAULT '未作成'
               CHECK (status IN ('未作成','作成中','提出済','完成')),
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- ROW-LEVEL SECURITY (multi-tenant isolation)
-- Users can only see data that belongs to their organization.
-- ============================================================

ALTER TABLE organizations  ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles        ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects        ENABLE ROW LEVEL SECURITY;
ALTER TABLE species         ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments        ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents       ENABLE ROW LEVEL SECURITY;

-- Helper: returns the organization_id for the current user
CREATE OR REPLACE FUNCTION my_org()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT organization_id FROM profiles WHERE id = auth.uid() LIMIT 1;
$$;

-- Organizations
CREATE POLICY "org_select" ON organizations FOR SELECT
  USING (id = my_org());

-- Profiles: see everyone in your org
CREATE POLICY "profile_select" ON profiles FOR SELECT
  USING (organization_id = my_org());

CREATE POLICY "profile_update_own" ON profiles FOR UPDATE
  USING (id = auth.uid());

-- Projects: full access within org
CREATE POLICY "project_select" ON projects FOR SELECT
  USING (organization_id = my_org());

CREATE POLICY "project_insert" ON projects FOR INSERT
  WITH CHECK (organization_id = my_org());

CREATE POLICY "project_update" ON projects FOR UPDATE
  USING (organization_id = my_org());

CREATE POLICY "project_delete" ON projects FOR DELETE
  USING (organization_id = my_org());

-- Species: scoped through project
CREATE POLICY "species_select" ON species FOR SELECT
  USING (project_id IN (SELECT id FROM projects WHERE organization_id = my_org()));

CREATE POLICY "species_insert" ON species FOR INSERT
  WITH CHECK (project_id IN (SELECT id FROM projects WHERE organization_id = my_org()));

CREATE POLICY "species_update" ON species FOR UPDATE
  USING (project_id IN (SELECT id FROM projects WHERE organization_id = my_org()));

CREATE POLICY "species_delete" ON species FOR DELETE
  USING (project_id IN (SELECT id FROM projects WHERE organization_id = my_org()));

-- Comments
CREATE POLICY "comment_select" ON comments FOR SELECT
  USING (project_id IN (SELECT id FROM projects WHERE organization_id = my_org()));

CREATE POLICY "comment_insert" ON comments FOR INSERT
  WITH CHECK (project_id IN (SELECT id FROM projects WHERE organization_id = my_org()));

-- Documents
CREATE POLICY "document_select" ON documents FOR SELECT
  USING (project_id IN (SELECT id FROM projects WHERE organization_id = my_org()));

CREATE POLICY "document_all" ON documents FOR ALL
  USING (project_id IN (SELECT id FROM projects WHERE organization_id = my_org()));

-- ============================================================
-- STORAGE BUCKET for report files
-- Run separately in Supabase Dashboard → Storage
-- ============================================================
-- INSERT INTO storage.buckets (id, name, public) VALUES ('reports', 'reports', false);
-- Then add policy: authenticated users in same org can read/write
