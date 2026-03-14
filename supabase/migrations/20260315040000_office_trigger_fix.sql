-- Apply the updated_at trigger to office_locations
-- This ensures that updating existing office records (like changing coordinates)
-- actually updates the timestamp used for "Latest Office" sorting.

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'update_office_locations_updated_at'
  ) THEN
    CREATE TRIGGER update_office_locations_updated_at
    BEFORE UPDATE ON public.office_locations
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;
