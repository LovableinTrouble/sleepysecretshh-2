REVOKE ALL ON FUNCTION public.handle_new_sleepy_user() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.handle_new_sleepy_user() FROM anon;
REVOKE ALL ON FUNCTION public.handle_new_sleepy_user() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_sleepy_user() TO service_role;