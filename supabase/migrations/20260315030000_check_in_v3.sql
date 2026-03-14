-- Standardize check_in_with_geofence to match QR/Portal robustness
-- This version adds high-precision distance reporting and correctly picks the LATEST active office.

CREATE OR REPLACE FUNCTION public.check_in_with_geofence(
  p_latitude DOUBLE PRECISION,
  p_longitude DOUBLE PRECISION,
  p_face_match_score DOUBLE PRECISION DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_office_id UUID;
  v_office_lat DOUBLE PRECISION;
  v_office_lng DOUBLE PRECISION;
  v_office_radius DOUBLE PRECISION;
  v_working_days INTEGER[];
  v_dist DOUBLE PRECISION;
  v_now TIMESTAMP WITH TIME ZONE := now();
  v_status attendance_status;
  v_today_day INTEGER := EXTRACT(DOW FROM now());
BEGIN
  -- 1. Auth Check
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'User not authenticated.');
  END IF;

  -- 2. Fetch LATEST Office Config
  SELECT id, latitude, longitude, radius_meters, working_days 
  INTO v_office_id, v_office_lat, v_office_lng, v_office_radius, v_working_days
  FROM public.office_locations
  WHERE is_active = true
  ORDER BY updated_at DESC, created_at DESC -- Explicitly pick the most recently updated
  LIMIT 1;

  IF v_office_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'No active office location found.');
  END IF;

  -- 3. Working Days Check
  IF NOT (v_today_day = ANY(v_working_days)) THEN
    RETURN jsonb_build_object(
      'success', false, 
      'message', 'Attendance operations are closed today.'
    );
  END IF;

  -- 4. Geofence Calculation (Standardized with 15m buffer)
  v_dist := ST_Distance(
    ST_SetSRID(ST_MakePoint(p_longitude, p_latitude), 4326)::geography,
    ST_SetSRID(ST_MakePoint(COALESCE(v_office_lng, 0), COALESCE(v_office_lat, 0)), 4326)::geography
  );

  IF v_dist > (v_office_radius + 15) THEN
    RETURN jsonb_build_object(
      'success', false, 
      'message', 'Outside office geofence.',
      'debug_distance_meters', ROUND(v_dist::numeric, 2),
      'office_id', v_office_id
    );
  END IF;

  -- 5. Prevent Double Check-in (One per day for manual/personal check-in)
  IF EXISTS (
    SELECT 1 FROM public.attendance_logs
    WHERE user_id = v_user_id
    AND check_in_at::date = v_now::date
  ) THEN
    RETURN jsonb_build_object(
      'success', true, 
      'message', 'You have already checked in today.',
      'status', 'present' -- Return existing status if possible, defaulting to present for UI
    );
  END IF;

  -- 6. Determine Status
  IF EXTRACT(HOUR FROM v_now) < 9 THEN 
    v_status := 'present'; 
  ELSE 
    v_status := 'late'; 
  END IF;

  -- 7. Record Attendance
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
    p_face_match_score,
    CASE WHEN p_face_match_score IS NOT NULL THEN 'face' ELSE 'manual' END
  );

  RETURN jsonb_build_object(
    'success', true, 
    'message', 'Attendance recorded successfully!', 
    'status', v_status,
    'office_id', v_office_id,
    'debug_distance_meters', ROUND(v_dist::numeric, 2)
  );
END;
$$;
