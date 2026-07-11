-- M1 (audit): the UPDATE policies on profiles and resumes only had a USING clause.
-- Without WITH CHECK, a user can UPDATE their own row and reassign user_id to someone
-- else (row-ownership reassignment). Add WITH CHECK so the row must still belong to the
-- caller after the update.

-- profiles
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- resumes
DROP POLICY IF EXISTS "Users can update own resumes" ON public.resumes;
CREATE POLICY "Users can update own resumes" ON public.resumes
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
