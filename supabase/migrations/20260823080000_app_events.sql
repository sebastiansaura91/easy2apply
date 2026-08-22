-- Product telemetry: funnel events + client errors, first-party and RLS-scoped.
-- Users write and read ONLY their own rows; no third-party analytics SDK involved.
-- GRANTs are explicit (lesson from the ai_usage migration: the runner's default
-- privileges don't cover Data API access).

CREATE TABLE public.app_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event text NOT NULL,
  props jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.app_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users insert own events" ON public.app_events
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users read own events" ON public.app_events
  FOR SELECT USING (auth.uid() = user_id);
-- No UPDATE/DELETE: events are immutable; erasure rides the auth.users cascade.

CREATE INDEX app_events_user_created_idx ON public.app_events (user_id, created_at DESC);
CREATE INDEX app_events_event_created_idx ON public.app_events (event, created_at DESC);

GRANT SELECT, INSERT ON public.app_events TO authenticated;
