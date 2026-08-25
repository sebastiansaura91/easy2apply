-- Data model v2: analyses out of the __meta blob, a real home for the competence
-- registry, and the (until now unused) resume_versions table put to work as the
-- undo/version stack. Expand phase: the frontend dual-writes __meta AND these
-- tables, so nothing breaks whichever side deploys first.

-- 1) Analysis history: one row per deep scan / role-fit, never overwritten.
--    This is the substrate for the score truth layer (trends, de-ratcheting,
--    quality/match decomposition) — __meta keeps only the latest as a cache.
CREATE TABLE IF NOT EXISTS public.analyses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  resume_id UUID NOT NULL REFERENCES public.resumes(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('scan', 'rolefit')),
  -- Hash of (CV content + job text) the analysis was computed from — the
  -- stability contract: same hash, same stored result, no re-sampling.
  input_hash TEXT NOT NULL,
  score INTEGER,
  grade TEXT,
  subscores JSONB,
  result JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own analyses" ON public.analyses
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own analyses" ON public.analyses
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own analyses" ON public.analyses
  FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_analyses_resume_kind_at
  ON public.analyses (resume_id, kind, created_at DESC);

-- The Data API needs explicit grants (RLS still gates rows).
GRANT SELECT, INSERT, DELETE ON public.analyses TO authenticated;

-- 2) The competence registry gets its own table (one row per user) instead of
--    living in a hidden resume row that every list had to filter out.
CREATE TABLE IF NOT EXISTS public.competence_registry (
  user_id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  version INTEGER NOT NULL DEFAULT 1,
  data JSONB NOT NULL DEFAULT '{"competences": []}'::jsonb,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.competence_registry ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own registry" ON public.competence_registry
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own registry" ON public.competence_registry
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own registry" ON public.competence_registry
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own registry" ON public.competence_registry
  FOR DELETE USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.competence_registry TO authenticated;

-- 3) resume_versions exists since the original scaffold but was never used.
--    The editor now writes a snapshot here before every automatic change
--    (undo stack, pruned to the latest 20 per CV). Grants + read index.
GRANT SELECT, INSERT, DELETE ON public.resume_versions TO authenticated;

CREATE INDEX IF NOT EXISTS idx_resume_versions_resume_at
  ON public.resume_versions (resume_id, created_at DESC);
