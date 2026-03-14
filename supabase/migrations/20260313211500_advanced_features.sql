
-- 1. ADD BIOMETRIC COLUMNS TO PROFILES
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS face_embedding REAL[],
ADD COLUMN IF NOT EXISTS face_enrolled BOOLEAN DEFAULT false;

-- 2. CREATE AUDIT LOGS TABLE
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  actor_id UUID REFERENCES auth.users(id),
  action TEXT NOT NULL,
  target_id UUID,
  details JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- 3. RLS FOR AUDIT LOGS (Admin only)
CREATE POLICY "Admins can view all audit logs" ON public.audit_logs 
FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

-- 4. CREATE UPDATE_USER_ROLE RPC
CREATE OR REPLACE FUNCTION public.update_user_role(
  p_target_user_id UUID,
  p_new_role app_role
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Check if caller is admin
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can update roles.';
  END IF;

  -- Update role
  INSERT INTO public.user_roles (user_id, role)
  VALUES (p_target_user_id, p_new_role)
  ON CONFLICT (user_id, role) DO NOTHING;
  
  -- Optionally delete other roles if the system assumes one role per user
  -- DELETE FROM public.user_roles WHERE user_id = p_target_user_id AND role != p_new_role;

  -- Log action
  INSERT INTO public.audit_logs (actor_id, action, target_id, details)
  VALUES (
    auth.uid(),
    'update_role',
    p_target_user_id,
    jsonb_build_object('new_role', p_new_role)
  );
END;
$$;

-- 5. SEED NASIDA HEADQUARTERS
INSERT INTO public.office_locations (name, location, radius_meters, is_active)
VALUES (
  'NASIDA Headquarters',
  ST_SetSRID(ST_MakePoint(8.5134, 8.4975), 4326)::geography,
  100,
  true
)
ON CONFLICT DO NOTHING;
