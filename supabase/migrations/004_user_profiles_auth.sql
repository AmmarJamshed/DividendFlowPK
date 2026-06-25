-- User profiles linked to Supabase Auth (email + Google OAuth)

CREATE TABLE IF NOT EXISTS public.user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  first_name TEXT NOT NULL DEFAULT '',
  last_name TEXT NOT NULL DEFAULT '',
  date_of_birth DATE,
  phone_number TEXT,
  gender TEXT CHECK (gender IS NULL OR gender IN ('male', 'female', 'other', 'prefer_not_to_say')),
  auth_provider TEXT NOT NULL DEFAULT 'email',
  profile_complete BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_profiles_email ON public.user_profiles(email);

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_profiles_select_own ON public.user_profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY user_profiles_insert_own ON public.user_profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY user_profiles_update_own ON public.user_profiles
  FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE OR REPLACE FUNCTION public.set_profile_complete_flag()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.profile_complete := (
    length(trim(COALESCE(NEW.first_name, ''))) > 0
    AND length(trim(COALESCE(NEW.last_name, ''))) > 0
    AND NEW.date_of_birth IS NOT NULL
    AND length(trim(COALESCE(NEW.phone_number, ''))) > 0
    AND NEW.gender IS NOT NULL
  );
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_user_profiles_complete ON public.user_profiles;
CREATE TRIGGER trg_user_profiles_complete
  BEFORE INSERT OR UPDATE ON public.user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_profile_complete_flag();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  meta JSONB := COALESCE(NEW.raw_user_meta_data, '{}'::jsonb);
  provider TEXT := COALESCE(NEW.raw_app_meta_data->>'provider', 'email');
  fname TEXT := COALESCE(meta->>'first_name', meta->>'given_name', '');
  lname TEXT := COALESCE(meta->>'last_name', meta->>'family_name', '');
  full_name TEXT := COALESCE(meta->>'full_name', meta->>'name', '');
  dob DATE;
  phone TEXT := NULLIF(trim(COALESCE(meta->>'phone_number', meta->>'phone', '')), '');
  gen TEXT := NULLIF(meta->>'gender', '');
BEGIN
  IF fname = '' AND full_name <> '' THEN
    fname := split_part(full_name, ' ', 1);
    lname := NULLIF(trim(substring(full_name from length(split_part(full_name, ' ', 1)) + 2)), '');
  END IF;

  IF meta->>'date_of_birth' IS NOT NULL AND meta->>'date_of_birth' <> '' THEN
    BEGIN
      dob := (meta->>'date_of_birth')::date;
    EXCEPTION WHEN OTHERS THEN
      dob := NULL;
    END;
  END IF;

  IF gen IS NOT NULL AND gen NOT IN ('male', 'female', 'other', 'prefer_not_to_say') THEN
    gen := NULL;
  END IF;

  INSERT INTO public.user_profiles (
    id, email, first_name, last_name, date_of_birth, phone_number, gender, auth_provider
  ) VALUES (
    NEW.id, NEW.email, fname, COALESCE(lname, ''), dob, phone, gen, provider
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    first_name = CASE WHEN user_profiles.first_name = '' THEN EXCLUDED.first_name ELSE user_profiles.first_name END,
    last_name = CASE WHEN user_profiles.last_name = '' THEN EXCLUDED.last_name ELSE user_profiles.last_name END,
    date_of_birth = COALESCE(user_profiles.date_of_birth, EXCLUDED.date_of_birth),
    phone_number = COALESCE(user_profiles.phone_number, EXCLUDED.phone_number),
    gender = COALESCE(user_profiles.gender, EXCLUDED.gender),
    auth_provider = EXCLUDED.auth_provider,
    updated_at = now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
