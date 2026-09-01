DROP FUNCTION IF EXISTS public.handle_new_user();
REVOKE ALL ON FUNCTION public.touch_updated_at() FROM anon, authenticated, PUBLIC;