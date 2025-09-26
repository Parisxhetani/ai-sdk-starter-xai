-- Update function to auto-whitelist @facilization.com domain
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  whitelisted_emails_json TEXT;
  whitelisted_emails_array TEXT[];
  is_whitelisted BOOLEAN := false;
BEGIN
  -- Get whitelisted emails from settings
  SELECT value INTO whitelisted_emails_json 
  FROM public.settings 
  WHERE key = 'whitelisted_emails';
  
  -- Parse JSON array of whitelisted emails
  SELECT ARRAY(SELECT json_array_elements_text(whitelisted_emails_json::json))
  INTO whitelisted_emails_array;
  
  -- Check if user email is whitelisted
  IF NEW.email = ANY(whitelisted_emails_array) THEN
    is_whitelisted := true;
  END IF;
  
  -- Auto-whitelist @facilization.com domain
  IF NEW.email LIKE '%@facilization.com' THEN
    is_whitelisted := true;
  END IF;
  
  -- Insert user profile
  INSERT INTO public.users (id, email, name, role, whitelisted)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'name', split_part(NEW.email, '@', 1)),
    CASE WHEN NEW.email = 'admin@company.com' THEN 'admin' ELSE 'member' END,
    is_whitelisted
  )
  ON CONFLICT (id) DO NOTHING;
  
  -- Log the registration event
  INSERT INTO public.events (type, user_id, payload)
  VALUES (
    'user_registered',
    NEW.id,
    json_build_object(
      'email', NEW.email,
      'whitelisted', is_whitelisted
    )
  );
  
  RETURN NEW;
END;
$$;
