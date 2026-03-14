
-- Enable PostGIS extension
CREATE EXTENSION IF NOT EXISTS postgis;

-- Create role enum
CREATE TYPE public.app_role AS ENUM ('admin', 'hr', 'staff');

-- Create attendance status enum
CREATE TYPE public.attendance_status AS ENUM ('present', 'late', 'absent', 'excused');

-- Create dispute status enum
CREATE TYPE public.dispute_status AS ENUM ('pending', 'approved', 'rejected');

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- PROFILES TABLE
CREATE TABLE public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  department TEXT,
  designation TEXT,
  profile_photo_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- USER ROLES TABLE
CREATE TABLE public.user_roles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL DEFAULT 'staff',
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- SECURITY DEFINER FUNCTION FOR ROLE CHECKS
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

-- OFFICE LOCATIONS TABLE (PostGIS)
CREATE TABLE public.office_locations (
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
ALTER TABLE public.office_locations ENABLE ROW LEVEL SECURITY;

-- ATTENDANCE LOGS TABLE
CREATE TABLE public.attendance_logs (
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
ALTER TABLE public.attendance_logs ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_attendance_logs_user_id ON public.attendance_logs (user_id);
CREATE INDEX idx_attendance_logs_check_in ON public.attendance_logs (check_in_at);

-- DISPUTES TABLE
CREATE TABLE public.disputes (
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
ALTER TABLE public.disputes ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_disputes_user_id ON public.disputes (user_id);
CREATE INDEX idx_disputes_status ON public.disputes (status);

-- TRIGGERS
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_office_locations_updated_at BEFORE UPDATE ON public.office_locations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_attendance_logs_updated_at BEFORE UPDATE ON public.attendance_logs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_disputes_updated_at BEFORE UPDATE ON public.disputes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- AUTO-CREATE PROFILE + STAFF ROLE ON SIGNUP
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

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- RLS — PROFILES
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "HR and Admin can view all profiles" ON public.profiles FOR SELECT USING (public.has_role(auth.uid(), 'hr') OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Admin can update any profile" ON public.profiles FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "System can insert profiles" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);

-- RLS — USER ROLES
CREATE POLICY "Users can view own roles" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admin can view all roles" ON public.user_roles FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin can manage roles" ON public.user_roles FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- RLS — OFFICE LOCATIONS
CREATE POLICY "Everyone can view active locations" ON public.office_locations FOR SELECT USING (is_active = true);
CREATE POLICY "Admin can manage locations" ON public.office_locations FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- RLS — ATTENDANCE LOGS
CREATE POLICY "Users can view own attendance" ON public.attendance_logs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "HR and Admin can view all attendance" ON public.attendance_logs FOR SELECT USING (public.has_role(auth.uid(), 'hr') OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users can insert own attendance" ON public.attendance_logs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own attendance" ON public.attendance_logs FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "HR and Admin can update any attendance" ON public.attendance_logs FOR UPDATE USING (public.has_role(auth.uid(), 'hr') OR public.has_role(auth.uid(), 'admin'));

-- RLS — DISPUTES
CREATE POLICY "Users can view own disputes" ON public.disputes FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "HR and Admin can view all disputes" ON public.disputes FOR SELECT USING (public.has_role(auth.uid(), 'hr') OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users can create own disputes" ON public.disputes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "HR and Admin can update disputes" ON public.disputes FOR UPDATE USING (public.has_role(auth.uid(), 'hr') OR public.has_role(auth.uid(), 'admin'));

-- STORAGE BUCKETS
INSERT INTO storage.buckets (id, name, public) VALUES ('selfies', 'selfies', false);
INSERT INTO storage.buckets (id, name, public) VALUES ('evidence', 'evidence', false);
INSERT INTO storage.buckets (id, name, public) VALUES ('profile-photos', 'profile-photos', true);

-- Storage — selfies
CREATE POLICY "Users can upload own selfies" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'selfies' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can view own selfies" ON storage.objects FOR SELECT USING (bucket_id = 'selfies' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "HR/Admin can view all selfies" ON storage.objects FOR SELECT USING (bucket_id = 'selfies' AND (public.has_role(auth.uid(), 'hr') OR public.has_role(auth.uid(), 'admin')));

-- Storage — evidence
CREATE POLICY "Users can upload own evidence" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'evidence' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can view own evidence" ON storage.objects FOR SELECT USING (bucket_id = 'evidence' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "HR/Admin can view all evidence" ON storage.objects FOR SELECT USING (bucket_id = 'evidence' AND (public.has_role(auth.uid(), 'hr') OR public.has_role(auth.uid(), 'admin')));

-- Storage — profile photos
CREATE POLICY "Anyone can view profile photos" ON storage.objects FOR SELECT USING (bucket_id = 'profile-photos');
CREATE POLICY "Users can upload own profile photo" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'profile-photos' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can update own profile photo" ON storage.objects FOR UPDATE USING (bucket_id = 'profile-photos' AND auth.uid()::text = (storage.foldername(name))[1]);
