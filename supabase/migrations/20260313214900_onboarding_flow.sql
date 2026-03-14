
-- 1. CREATE DEPARTMENTS TABLE
CREATE TABLE IF NOT EXISTS public.departments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;

-- 2. RLS FOR DEPARTMENTS
CREATE POLICY "Everyone can view departments" ON public.departments FOR SELECT USING (true);
CREATE POLICY "Admins can manage departments" ON public.departments FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- 3. ADD ONBOARDED FLAG TO PROFILES
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS onboarded BOOLEAN DEFAULT false;

-- 4. SEED INITIAL DEPARTMENTS
INSERT INTO public.departments (name)
VALUES 
  ('Engineering'),
  ('Human Resources'),
  ('Marketing'),
  ('Operations'),
  ('Finance'),
  ('Legal')
ON CONFLICT (name) DO NOTHING;
