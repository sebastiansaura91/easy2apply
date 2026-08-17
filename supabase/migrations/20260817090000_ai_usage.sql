-- AI usage accounting: the quota backstop (per-user daily call counter) and the
-- observability log (per-call model/latency/tokens). Written ONLY by the shared
-- gateway via the service role; users can read their own rows, never write.

CREATE TABLE public.ai_usage_daily (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  day date NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::date,
  calls integer NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);

ALTER TABLE public.ai_usage_daily ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own usage" ON public.ai_usage_daily
  FOR SELECT USING (auth.uid() = user_id);
-- No INSERT/UPDATE/DELETE policies: only the service role writes.

CREATE TABLE public.ai_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  fn text NOT NULL,
  model text NOT NULL,
  ms integer NOT NULL,
  status integer NOT NULL,
  tokens_in integer,
  tokens_out integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_calls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own ai calls" ON public.ai_calls
  FOR SELECT USING (auth.uid() = user_id);
-- No INSERT/UPDATE/DELETE policies: only the service role writes.

CREATE INDEX ai_calls_user_created_idx ON public.ai_calls (user_id, created_at DESC);
CREATE INDEX ai_calls_fn_created_idx ON public.ai_calls (fn, created_at DESC);

-- Atomic increment-and-read for the quota check. SECURITY DEFINER so the gateway's
-- single RPC both counts the call and returns today's total.
CREATE OR REPLACE FUNCTION public.increment_ai_usage(p_user uuid, p_fn text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_calls integer;
BEGIN
  INSERT INTO public.ai_usage_daily (user_id, day, calls)
  VALUES (p_user, (now() AT TIME ZONE 'utc')::date, 1)
  ON CONFLICT (user_id, day)
  DO UPDATE SET calls = public.ai_usage_daily.calls + 1
  RETURNING calls INTO new_calls;
  RETURN new_calls;
END;
$$;

-- Only the service role may call it.
REVOKE ALL ON FUNCTION public.increment_ai_usage(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.increment_ai_usage(uuid, text) FROM anon, authenticated;
