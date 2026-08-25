CREATE TABLE IF NOT EXISTS public.analyses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  resume_id UUID NOT NULL REFERENCES public.resumes(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('scan', 'rolefit')),
  input_hash TEXT NOT NULL,
  score INTEGER,
  grade TEXT,
  subscores JSONB,
  result JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, DELETE ON public.analyses TO authenticated;
GRANT ALL ON public.analyses TO service_role;

ALTER TABLE public.analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own analyses" ON public.analyses
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own analyses" ON public.analyses
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own analyses" ON public.analyses
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_analyses_resume_kind_at
  ON public.analyses (resume_id, kind, created_at DESC);

CREATE TABLE IF NOT EXISTS public.competence_registry (
  user_id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  version INTEGER NOT NULL DEFAULT 1,
  data JSONB NOT NULL DEFAULT '{"competences": []}'::jsonb,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.competence_registry TO authenticated;
GRANT ALL ON public.competence_registry TO service_role;

ALTER TABLE public.competence_registry ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own registry" ON public.competence_registry
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own registry" ON public.competence_registry
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own registry" ON public.competence_registry
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own registry" ON public.competence_registry
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

GRANT SELECT, INSERT, DELETE ON public.resume_versions TO authenticated;
GRANT ALL ON public.resume_versions TO service_role;

CREATE INDEX IF NOT EXISTS idx_resume_versions_resume_at
  ON public.resume_versions (resume_id, created_at DESC);