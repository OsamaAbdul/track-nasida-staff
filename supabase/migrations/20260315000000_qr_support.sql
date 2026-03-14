-- Add qr_token to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS qr_token UUID DEFAULT gen_random_uuid() UNIQUE;

-- Create index for fast QR lookups
CREATE INDEX IF NOT EXISTS idx_profiles_qr_token ON public.profiles(qr_token);

-- RPC for QR-based check-in
CREATE OR REPLACE FUNCTION public.check_in_with_qr(
  p_qr_token UUID,
  p_latitude DOUBLE PRECISION,
  p_longitude DOUBLE PRECISION
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
  v_full_name TEXT;
  v_office_id UUID;
  v_office_lat DOUBLE PRECISION;
  v_office_lng DOUBLE PRECISION;
  v_office_radius DOUBLE PRECISION;
  v_working_days INTEGER[];
  v_dist DOUBLE PRECISION;
  v_is_late BOOLEAN;
  v_onboarded BOOLEAN;
BEGIN
  -- 1. Identify user by QR token
  SELECT user_id, full_name, onboarded INTO v_user_id, v_full_name, v_onboarded
  FROM public.profiles
  WHERE qr_token = p_qr_token;

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Invalid QR Code');
  END IF;

  IF NOT v_onboarded THEN
    RETURN jsonb_build_object('success', false, 'message', 'Onboarding incomplete');
  END IF;

  -- 2. Validate Geofence
  SELECT id, latitude, longitude, radius_meters, working_days 
  INTO v_office_id, v_office_lat, v_office_lng, v_office_radius, v_working_days
  FROM public.office_locations
  WHERE is_active = true
  LIMIT 1;

  IF v_office_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'No active office location found');
  END IF;

  -- Check working days
  IF NOT (extract(dow from now()) = ANY(v_working_days)) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Office is closed today');
  END IF;

  -- Calculate distance using PostGIS or sphere calculation
  v_dist := ST_Distance(
    ST_SetSRID(ST_MakePoint(p_longitude, p_latitude), 4326)::geography,
    ST_SetSRID(ST_MakePoint(v_office_lng, v_office_lat), 4326)::geography
  );

  IF v_dist > (v_office_radius + 15) THEN -- 15m buffer
    RETURN jsonb_build_object(
      'success', false, 
      'message', 'Out of range',
      'debug_distance_meters', round(v_dist::numeric, 2)
    );
  END IF;

  -- 3. Prevent Double Entry (e.g., within 5 minutes)
  IF EXISTS (
    SELECT 1 FROM public.attendance_logs
    WHERE user_id = v_user_id
    AND check_in_at > (now() - interval '5 minutes')
  ) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Already checked in recently');
  END IF;

  -- 4. Record Attendance
  v_is_late := (extract(hour from now()) >= 9); -- Late after 9:00 AM

  INSERT INTO public.attendance_logs (
    user_id,
    office_id,
    check_in_at,
    status,
    location,
    latitude,
    longitude,
    verification_method
  ) VALUES (
    v_user_id,
    v_office_id,
    now(),
    (CASE WHEN v_is_late THEN 'late' ELSE 'present' END)::public.attendance_status,
    ST_SetSRID(ST_MakePoint(p_longitude, p_latitude), 4326)::geography,
    p_latitude,
    p_longitude,
    'qr'
  );

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Checked in successfully using QR',
    'full_name', v_full_name
  );
END;
$$;
