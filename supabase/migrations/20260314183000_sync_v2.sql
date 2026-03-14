
-- ====================================================================
-- BACKEND SYNCHRONIZATION V2
-- This script aligns the database with Geofence Diagnostics, 
-- Working Days restrictions, and Hands-free Auto-Detection.
-- ====================================================================

-- 1. Ensure working_days column exists in office_locations
ALTER TABLE public.office_locations 
ADD COLUMN IF NOT EXISTS working_days INTEGER[] DEFAULT '{1,2,3,4,5}';

-- 1.5. Clean up old function variants to avoid ambiguity
DROP FUNCTION IF EXISTS public.identify_and_check_in(REAL[], DOUBLE PRECISION, DOUBLE PRECISION);
DROP FUNCTION IF EXISTS public.identify_and_check_in(DOUBLE PRECISION[], DOUBLE PRECISION, DOUBLE PRECISION);

-- 2. Comprehensive Identification & Check-in RPC
-- This function handles:
--  - AI Face Matching (Euclidean distance)
--  - Geofence calculation (PostGIS)
--  - Working Days verification
--  - Double-entry prevention
--  - Returning the user's Full Name for UI greeting
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
  -- Note: p_descriptor <-> face_embedding works if pgvector is enabled. 
  -- In this standard REAL[] implementation, we use a manual distance calculation for compatibility.
  SELECT 
    user_id, 
    full_name,
    (1 - (SELECT sqrt(sum(pow(v1 - v2, 2))) FROM (SELECT unnest(p_descriptor) as v1, unnest(face_embedding) as v2) s)) as match_score
  INTO v_user_id, v_full_name, v_match_score
  FROM public.profiles
  WHERE face_enrolled = true
  ORDER BY (SELECT sum(pow(v1 - v2, 2)) FROM (SELECT unnest(p_descriptor) as v1, unnest(face_embedding) as v2) s) ASC
  LIMIT 1;

  -- B. Verify Match Quality (0.6 match score corresponds to ~0.4 distance)
  IF v_user_id IS NULL OR v_match_score < 0.6 THEN
    RETURN jsonb_build_object(
      'success', false, 
      'message', 'Face not recognized. Please move closer and ensure good lighting.'
    );
  END IF;

  -- C. Fetch Office Config & Calculate Distance
  SELECT id, radius_meters, working_days,
         ST_Distance(location, ST_SetSRID(ST_MakePoint(p_longitude, p_latitude), 4326)::geography)
  INTO v_office_id, v_radius, v_working_days, v_dist_to_office
  FROM public.office_locations
  WHERE is_active = true
  LIMIT 1;

  -- D. Working Days Check
  IF NOT (v_today_day = ANY(v_working_days)) THEN
    RETURN jsonb_build_object(
      'success', false, 
      'message', 'Attendance operations are closed today.'
    );
  END IF;

  -- E. Geofence Check
  IF v_dist_to_office > v_radius THEN
    RETURN jsonb_build_object(
      'success', false, 
      'message', 'Outside office geofence.',
      'debug_distance_meters', ROUND(v_dist_to_office::numeric, 2)
    );
  END IF;

  -- F. Prevent Double Check-in (One check-in per day)
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

  -- G. Determine Status (Before 9 AM is present, after is late)
  IF EXTRACT(HOUR FROM v_now) < 9 THEN 
    v_status := 'present'; 
  ELSE 
    v_status := 'late'; 
  END IF;

  -- H. Record Attendance
  INSERT INTO public.attendance_logs (
    user_id, 
    check_in_at, 
    location, 
    status, 
    face_match_score
  )
  VALUES (
    v_user_id, 
    v_now, 
    ST_SetSRID(ST_MakePoint(p_longitude, p_latitude), 4326)::geography, 
    v_status, 
    v_match_score
  );

  RETURN jsonb_build_object(
    'success', true, 
    'message', 'Attendance recorded successfully!', 
    'full_name', v_full_name,
    'status', v_status
  );
END;
$$;
