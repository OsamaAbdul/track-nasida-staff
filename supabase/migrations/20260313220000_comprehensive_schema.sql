
-- ==========================================
-- 1. EXTENSIONS & ENUMS
-- ==========================================
CREATE EXTENSION IF NOT EXISTS postgis;

DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin', 'hr', 'staff');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE public.attendance_status AS ENUM ('present', 'late', 'absent', 'excused');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE public.dispute_status AS ENUM ('pending', 'approved', 'rejected');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- ==========================================
-- 2. HELPER FUNCTIONS
-- ==========================================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- ==========================================
-- 3. TABLES
-- ==========================================

-- PROFILES
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  department TEXT,
  designation TEXT,
  profile_photo_url TEXT,
  face_embedding REAL[],
  face_enrolled BOOLEAN DEFAULT false,
  onboarded BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- DEPARTMENTS
CREATE TABLE IF NOT EXISTS public.departments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- USER ROLES
CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL DEFAULT 'staff',
  UNIQUE (user_id, role)
);

-- OFFICE LOCATIONS
CREATE TABLE IF NOT EXISTS public.office_locations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  location GEOGRAPHY(POINT, 4326) NOT NULL,
  radius_meters INTEGER NOT NULL DEFAULT 100,
  work_start TIME NOT NULL DEFAULT '08:00:00',
  work_end TIME NOT NULL DEFAULT '17:00:00',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_office_locations_location ON public.office_locations USING GIST (location);

-- ATTENDANCE LOGS
CREATE TABLE IF NOT EXISTS public.attendance_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  check_in_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  check_out_at TIMESTAMP WITH TIME ZONE,
  location GEOGRAPHY(POINT, 4326),
  status attendance_status NOT NULL DEFAULT 'present',
  face_match_score REAL,
  selfie_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_attendance_logs_user_id ON public.attendance_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_attendance_logs_check_in ON public.attendance_logs (check_in_at);

-- DISPUTES
CREATE TABLE IF NOT EXISTS public.disputes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  attendance_log_id UUID NOT NULL REFERENCES public.attendance_logs(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  evidence_urls TEXT[] DEFAULT '{}',
  status dispute_status NOT NULL DEFAULT 'pending',
  hr_notes TEXT,
  resolved_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_disputes_user_id ON public.disputes (user_id);
CREATE INDEX IF NOT EXISTS idx_disputes_status ON public.disputes (status);

-- AUDIT LOGS
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  actor_id UUID REFERENCES auth.users(id),
  action TEXT NOT NULL,
  target_id UUID,
  details JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- ==========================================
-- 4. TRIGGERS
-- ==========================================
DO $$ BEGIN
  CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TRIGGER update_office_locations_updated_at BEFORE UPDATE ON public.office_locations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TRIGGER update_attendance_logs_updated_at BEFORE UPDATE ON public.attendance_logs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TRIGGER update_disputes_updated_at BEFORE UPDATE ON public.disputes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ==========================================
-- 5. RPC FUNCTIONS
-- ==========================================

-- Role Check
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- New User Handler
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'staff');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DO $$ BEGIN
  CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Geofence Check-in
CREATE OR REPLACE FUNCTION public.check_in_with_geofence(
  p_latitude DOUBLE PRECISION,
  p_longitude DOUBLE PRECISION
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_is_within_office BOOLEAN;
  v_now TIMESTAMP WITH TIME ZONE := now();
  v_hour INTEGER;
  v_status attendance_status;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'User not authenticated.');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.office_locations
    WHERE ST_DWithin(
      location,
      ST_SetSRID(ST_MakePoint(p_longitude, p_latitude), 4326)::geography,
      radius_meters
    )
    AND is_active = true
  ) INTO v_is_within_office;

  IF NOT v_is_within_office THEN
    RETURN jsonb_build_object('success', false, 'message', 'You are outside the office geofence.');
  END IF;

  v_hour := EXTRACT(HOUR FROM v_now);
  IF v_hour < 9 THEN v_status := 'present'; ELSE v_status := 'late'; END IF;

  INSERT INTO public.attendance_logs (user_id, check_in_at, location, status)
  VALUES (v_user_id, v_now, ST_SetSRID(ST_MakePoint(p_longitude, p_latitude), 4326)::geography, v_status);

  RETURN jsonb_build_object('success', true, 'message', 'Checked in successfully.', 'status', v_status);
END;
$$;

-- Update User Role
CREATE OR REPLACE FUNCTION public.update_user_role(
  p_target_user_id UUID,
  p_new_role app_role
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can update roles.';
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (p_target_user_id, p_new_role)
  ON CONFLICT (user_id, role) DO NOTHING;
  
  INSERT INTO public.audit_logs (actor_id, action, target_id, details)
  VALUES (auth.uid(), 'update_role', p_target_user_id, jsonb_build_object('new_role', p_new_role));
END;
$$;

-- ==========================================
-- 6. RLS POLICIES
-- ==========================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.office_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.disputes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;

-- Profiles
CREATE POLICY "Users view own profile" ON public.profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "HR/Admin view all profiles" ON public.profiles FOR SELECT USING (public.has_role(auth.uid(), 'hr') OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Admin update any profile" ON public.profiles FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));

-- User Roles
CREATE POLICY "Users view own roles" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admin manage roles" ON public.user_roles FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- Office Locations
CREATE POLICY "Everyone view locations" ON public.office_locations FOR SELECT USING (true);
CREATE POLICY "Admin manage locations" ON public.office_locations FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- Attendance Logs
CREATE POLICY "Users view own attendance" ON public.attendance_logs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "HR/Admin view all attendance" ON public.attendance_logs FOR SELECT USING (public.has_role(auth.uid(), 'hr') OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users insert own attendance" ON public.attendance_logs FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Disputes
CREATE POLICY "Users view own disputes" ON public.disputes FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "HR/Admin view all disputes" ON public.disputes FOR SELECT USING (public.has_role(auth.uid(), 'hr') OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users create disputes" ON public.disputes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "HR/Admin update disputes" ON public.disputes FOR UPDATE USING (public.has_role(auth.uid(), 'hr') OR public.has_role(auth.uid(), 'admin'));

-- Audit Logs
CREATE POLICY "Admins view audit" ON public.audit_logs FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

-- Departments
CREATE POLICY "Everyone view departments" ON public.departments FOR SELECT USING (true);
CREATE POLICY "Admin manage departments" ON public.departments FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- ==========================================
-- 7. STORAGE POLICIES
-- ==========================================
INSERT INTO storage.buckets (id, name, public) VALUES ('selfies', 'selfies', false) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('evidence', 'evidence', false) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('profile-photos', 'profile-photos', true) ON CONFLICT (id) DO NOTHING;

-- Selfie Storage
CREATE POLICY "Selfie upload" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'selfies' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Selfie select" ON storage.objects FOR SELECT USING (bucket_id = 'selfies' AND (auth.uid()::text = (storage.foldername(name))[1] OR public.has_role(auth.uid(), 'hr') OR public.has_role(auth.uid(), 'admin')));

-- Evidence Storage
CREATE POLICY "Evidence upload" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'evidence' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Evidence select" ON storage.objects FOR SELECT USING (bucket_id = 'evidence' AND (auth.uid()::text = (storage.foldername(name))[1] OR public.has_role(auth.uid(), 'hr') OR public.has_role(auth.uid(), 'admin')));

-- Profile Photo Storage
CREATE POLICY "Photo select" ON storage.objects FOR SELECT USING (bucket_id = 'profile-photos');
CREATE POLICY "Photo upload" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'profile-photos' AND auth.uid()::text = (storage.foldername(name))[1]);

-- ==========================================
-- 8. SEEDS
-- ==========================================

-- Office Locations
INSERT INTO public.office_locations (name, location, radius_meters)
VALUES 
  ('NASIDA Headquarters', ST_SetSRID(ST_MakePoint(8.5134, 8.4975), 4326)::geography, 100)
ON CONFLICT DO NOTHING;

-- Departments
INSERT INTO public.departments (name)
VALUES 
  ('Engineering'), ('Human Resources'), ('Marketing'), ('Operations'), ('Finance'), ('Legal')
ON CONFLICT (name) DO NOTHING;
