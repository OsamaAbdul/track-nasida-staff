-- Add missing columns to attendance_logs for improved tracking
ALTER TABLE public.attendance_logs
ADD COLUMN IF NOT EXISTS office_id UUID REFERENCES public.office_locations(id),
ADD COLUMN IF NOT EXISTS verification_method TEXT DEFAULT 'face',
ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;

-- Update existing records to have a default verification method if they don't have one
UPDATE public.attendance_logs 
SET verification_method = 'face' 
WHERE verification_method IS NULL;

-- Create an index for faster reporting/filtering
CREATE INDEX IF NOT EXISTS idx_attendance_logs_verification ON public.attendance_logs(verification_method);
CREATE INDEX IF NOT EXISTS idx_attendance_logs_office_id ON public.attendance_logs(office_id);
