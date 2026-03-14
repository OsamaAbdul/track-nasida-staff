-- Update RPCs to always pick the LATEST active office
-- This prevents "ghost" office entries from causing sync issues

-- 1. Update identify_and_check_in
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
  v_is_within_office BOOLEAN;
  v_office_id UUID;
  v_radius INTEGER;
  v_working_days INTEGER[];
  v_dist_to_office DOUBLE PRECISION;
  v_now TIMESTAMP WITH TIME ZONE := now();
  v_status attendance_status;
  v_today_day INTEGER := EXTRACT(DOW FROM now());
BEGIN
  -- A. Find the closest matching face
  SELECT 
    user_id, 
    full_name,
    (1 - (SELECT sqrt(sum(pow(v1 - v2, 2))) FROM (SELECT unnest(p_descriptor) as v1, unnest(face_embedding) as v2) s)) as match_score
  INTO v_user_id, v_full_name, v_match_score
  FROM public.profiles
  WHERE face_enrolled = true
  ORDER BY (SELECT sum(pow(v1 - v2, 2)) FROM (SELECT unnest(p_descriptor) as v1, unnest(face_embedding) as v2) s) ASC
  LIMIT 1;

  -- B. Verify Match Quality
  IF v_user_id IS NULL OR v_match_score < 0.6 THEN
    RETURN jsonb_build_object(
      'success', false, 
      'message', 'Face not recognized. Please move closer and ensure good lighting.'
    );
  END IF;

  -- C. Fetch LATEST Office Config & Calculate Distance
  SELECT id, radius_meters, working_days,
         ST_Distance(location, ST_SetSRID(ST_MakePoint(p_longitude, p_latitude), 4326)::geography)
  INTO v_office_id, v_radius, v_working_days, v_dist_to_office
  FROM public.office_locations
  WHERE is_active = true
  ORDER BY created_at DESC -- CRITICAL: Pick the most recent one
  LIMIT 1;

  -- D. Working Days Check
  IF NOT (v_today_day = ANY(v_working_days)) THEN
    RETURN jsonb_build_object(
      'success', false, 
      'message', 'Attendance operations are closed today.'
    );
  END IF;

  -- E. Geofence Check
  IF v_dist_to_office > (v_radius + 15) THEN -- Added the 15m buffer in backend too
    RETURN jsonb_build_object(
      'success', false, 
      'message', 'Outside office geofence.',
      'debug_distance_meters', ROUND(v_dist_to_office::numeric, 2)
    );
  END IF;

  -- F. Prevent Double Check-in
  IF EXISTS (
    SELECT 1 FROM public.attendance_logs
    WHERE user_id = v_user_id
    AND check_in_at::date = v_now::date
  ) THEN
    RETURN jsonb_build_object(
      'success', true, 
      'message', 'Welcome back! You have already checked in today.', 
      'full_name', v_full_name
    );
  END IF;

  -- G. Determine Status
  IF EXTRACT(HOUR FROM v_now) < 9 THEN 
    v_status := 'present'; 
  ELSE 
    v_status := 'late'; 
  END IF;

  -- H. Record Attendance
  INSERT INTO public.attendance_logs (
    user_id, 
    office_id,
    check_in_at, 
    location, 
    latitude,
    longitude,
    status, 
    face_match_score,
    verification_method
  )
  VALUES (
    v_user_id, 
    v_office_id,
    v_now, 
    ST_SetSRID(ST_MakePoint(p_longitude, p_latitude), 4326)::geography, 
    p_latitude,
    p_longitude,
    v_status, 
    v_match_score,
    'face'
  );

  RETURN jsonb_build_object(
    'success', true, 
    'message', 'Attendance recorded successfully!', 
    'full_name', v_full_name,
    'status', v_status
  );
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
  v_onboarded BOOLEAN;
BEGIN
  -- 1. Identify user
  SELECT user_id, full_name, onboarded INTO v_user_id, v_full_name, v_onboarded
  FROM public.profiles
  WHERE qr_token = p_qr_token;

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Invalid QR Code');
  END IF;

  IF NOT v_onboarded THEN
    RETURN jsonb_build_object('success', false, 'message', 'Onboarding incomplete');
  END IF;

  -- 2. Validate LATEST Office Config
  SELECT id, latitude, longitude, radius_meters, working_days 
  INTO v_office_id, v_office_lat, v_office_lng, v_office_radius, v_working_days
  FROM public.office_locations
  WHERE is_active = true
  ORDER BY created_at DESC -- CRITICAL: Consistency
  LIMIT 1;

  IF v_office_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'No active office location found');
  END IF;

  -- Check working days
  IF NOT (extract(dow from now()) = ANY(v_working_days)) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Office is closed today');
  END IF;

  -- Calculate distance
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

  -- 3. Prevent Double Entry
  IF EXISTS (
    SELECT 1 FROM public.attendance_logs
    WHERE user_id = v_user_id
    AND check_in_at > (now() - interval '5 minutes')
  ) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Already checked in recently');
  END IF;

  -- 4. Record Attendance
  v_is_late := (extract(hour from now()) >= 9); 

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
