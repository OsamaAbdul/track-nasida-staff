-- Phase 35: Universal "One Truth" Policy
-- Standardize ALL check-in RPCs to use the EXACT same office selection logic (Latest modified)
-- This ensures the Diagnostic Panel and the Check-in logic ALWAYS see the same coordinates.

-- 1. Update identify_and_check_in (Face Recognition)
CREATE OR REPLACE FUNCTION public.identify_and_check_in(
  p_descriptor REAL[],
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
  v_match_score REAL;
  v_office_id UUID;
  v_radius INTEGER;
  v_working_days INTEGER[];
  v_dist_to_office DOUBLE PRECISION;
  v_now TIMESTAMP WITH TIME ZONE := now();
  v_status attendance_status;
  v_today_day INTEGER := EXTRACT(DOW FROM now());
BEGIN
  -- A. Face Recognition
  SELECT 
    user_id, 
    full_name,
    (1 - (SELECT sqrt(sum(pow(v1 - v2, 2))) FROM (SELECT unnest(p_descriptor) as v1, unnest(face_embedding) as v2) s)) as match_score
  INTO v_user_id, v_full_name, v_match_score
  FROM public.profiles
  WHERE face_enrolled = true
  ORDER BY (SELECT sum(pow(v1 - v2, 2)) FROM (SELECT unnest(p_descriptor) as v1, unnest(face_embedding) as v2) s) ASC
  LIMIT 1;

  IF v_user_id IS NULL OR v_match_score < 0.6 THEN
    RETURN jsonb_build_object('success', false, 'message', 'Face not recognized.');
  END IF;

  -- B. UNIVERSAL SELECTION: Pick the office modified MOST RECENTLY
  SELECT id, radius_meters, working_days,
         ST_Distance(location, ST_SetSRID(ST_MakePoint(p_longitude, p_latitude), 4326)::geography)
  INTO v_office_id, v_radius, v_working_days, v_dist_to_office
  FROM public.office_locations
  WHERE is_active = true
  ORDER BY updated_at DESC, created_at DESC -- THE ONE TRUTH
  LIMIT 1;

  IF v_office_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'No active office location found.');
  END IF;

  -- C. Checks
  IF NOT (v_today_day = ANY(v_working_days)) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Office is closed today.');
  END IF;

  IF v_dist_to_office > (v_radius + 15) THEN
    RETURN jsonb_build_object(
      'success', false, 
      'message', 'Outside office geofence.',
      'debug_distance_meters', ROUND(v_dist_to_office::numeric, 2)
    );
  END IF;

  -- D. Prevent Double Check-in
  IF EXISTS (
    SELECT 1 FROM public.attendance_logs
    WHERE user_id = v_user_id AND check_in_at::date = v_now::date
  ) THEN
    RETURN jsonb_build_object('success', true, 'message', 'Welcome back!', 'full_name', v_full_name);
  END IF;

  -- E. Record
  v_status := CASE WHEN EXTRACT(HOUR FROM v_now) < 9 THEN 'present' ELSE 'late' END;
  INSERT INTO public.attendance_logs (user_id, office_id, check_in_at, location, latitude, longitude, status, face_match_score, verification_method)
  VALUES (v_user_id, v_office_id, v_now, ST_SetSRID(ST_MakePoint(p_longitude, p_latitude), 4326)::geography, p_latitude, p_longitude, v_status, v_match_score, 'face');

  RETURN jsonb_build_object('success', true, 'message', 'Attendance recorded!', 'full_name', v_full_name, 'status', v_status);
END;
$$;

-- 2. Update check_in_with_qr
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
BEGIN
  -- A. Identify
  SELECT user_id, full_name FROM public.profiles WHERE qr_token = p_qr_token INTO v_user_id, v_full_name;
  IF v_user_id IS NULL THEN RETURN jsonb_build_object('success', false, 'message', 'Invalid QR Code'); END IF;

  -- B. UNIVERSAL SELECTION: Pick the office modified MOST RECENTLY
  SELECT id, latitude, longitude, radius_meters, working_days 
  INTO v_office_id, v_office_lat, v_office_lng, v_office_radius, v_working_days
  FROM public.office_locations
  WHERE is_active = true
  ORDER BY updated_at DESC, created_at DESC -- THE ONE TRUTH
  LIMIT 1;

  IF v_office_id IS NULL THEN RETURN jsonb_build_object('success', false, 'message', 'No active office'); END IF;

  -- C. Validate
  IF NOT (extract(dow from now()) = ANY(v_working_days)) THEN RETURN jsonb_build_object('success', false, 'message', 'Closed today'); END IF;
  
  v_dist := ST_Distance(ST_SetSRID(ST_MakePoint(p_longitude, p_latitude), 4326)::geography, ST_SetSRID(ST_MakePoint(v_office_lng, v_office_lat), 4326)::geography);
  IF v_dist > (v_office_radius + 15) THEN RETURN jsonb_build_object('success', false, 'message', 'Out of range', 'debug_distance_meters', round(v_dist::numeric, 2)); END IF;

  -- D. Record
  v_is_late := (extract(hour from now()) >= 9); 
  INSERT INTO public.attendance_logs (user_id, office_id, check_in_at, status, location, latitude, longitude, verification_method)
  VALUES (v_user_id, v_office_id, now(), (CASE WHEN v_is_late THEN 'late' ELSE 'present' END)::public.attendance_status, ST_SetSRID(ST_MakePoint(p_longitude, p_latitude), 4326)::geography, p_latitude, p_longitude, 'qr');

  RETURN jsonb_build_object('success', true, 'message', 'Checked in with QR', 'full_name', v_full_name);
END;
$$;
