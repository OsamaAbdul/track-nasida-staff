-- Add spatial index for office locations
CREATE INDEX IF NOT EXISTS idx_office_locations_location ON public.office_locations USING GIST (location);

-- Create or replace the check-in function with geofence validation
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
  -- Basic auth check
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'User not authenticated.'
    );
  END IF;

  -- Check if user is within any active office geofence
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
    RETURN jsonb_build_object(
      'success', false,
      'message', 'You are outside the office geofence.'
    );
  END IF;

  -- Logic to determine status
  v_hour := EXTRACT(HOUR FROM v_now);
  -- Match logic from existing Attendance.tsx: hour <= 8 ? "present" : hour <= 9 ? "late" : "late"
  IF v_hour < 9 THEN
    v_status := 'present';
  ELSE
    v_status := 'late';
  END IF;

  -- Insert attendance log
  INSERT INTO public.attendance_logs (user_id, check_in_at, location, status)
  VALUES (
    v_user_id,
    v_now,
    ST_SetSRID(ST_MakePoint(p_longitude, p_latitude), 4326)::geography,
    v_status
  )
  RETURNING id INTO v_user_id; -- Reuse variable for checking insert success

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Checked in successfully.',
    'status', v_status
  );
END;
$$;
