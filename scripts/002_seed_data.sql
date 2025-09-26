-- Insert default menu items
INSERT INTO public.menu_items (item, variant, active) VALUES
  ('Enchilada', 'Chicken', true),
  ('Enchilada', 'Beef', true),
  ('Burgers', 'Jalapeño Cheddar w/ Aioli', true),
  ('Burgers', 'Philly Cheesesteak', true),
  ('Burgers', 'Jack Daniel''s', true),
  ('Burgers', 'Hamburger', true),
  ('Burgers', 'Cheeseburger', true),
  ('Burgers', 'Bacon Cheeseburger', true),
  ('Burgers', 'Chicken Burger', true),
  ('Burgers', 'Mexican Burger', true),
  ('Burgers', 'Deluxe Burger', true),
  ('Burgers', 'Veggie Burger', true),
  ('Burgers', 'Caramelised Onion Blue Cheese Burger', true),
  ('Burgers', 'BBQ Pork Sandwich', true),
  ('Burgers', 'Club Sandwich', true),
  ('Burgers', 'Spicy Chicken Sandwich', true)
ON CONFLICT (item, variant) DO NOTHING;

-- Insert default settings
INSERT INTO public.settings (key, value) VALUES
  ('tony_phone', '+355691234567'),
  ('admin_phone', '+355691234567'),
  ('order_window_start', '09:00'),
  ('order_window_end', '12:30'),
  ('timezone', 'Europe/Tirane')
ON CONFLICT (key) DO NOTHING;

-- Insert whitelisted users (seed list for the 10-person team in Tirana)
-- Note: These will be created when users first sign up, but we're pre-whitelisting the emails
INSERT INTO public.settings (key, value) VALUES
  ('whitelisted_emails', '["admin@company.com","user1@company.com","user2@company.com","user3@company.com","user4@company.com","user5@company.com","user6@company.com","user7@company.com","user8@company.com","user9@company.com"]')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
