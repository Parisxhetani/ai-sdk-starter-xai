-- Add price support to Tony's menu and sync a Wolt menu snapshot.
-- Source snapshot: Tony's Wolt page (Tirana) reviewed on 2026-04-03.
-- Inference: protein-choice dishes that Wolt lists as a single menu item are split
-- into clearer variants where that matches this app's item/variant ordering flow.

ALTER TABLE public.menu_items
ADD COLUMN IF NOT EXISTS price_all INTEGER;

UPDATE public.menu_items
SET price_all = 0
WHERE price_all IS NULL;

ALTER TABLE public.menu_items
ALTER COLUMN price_all SET DEFAULT 0;

ALTER TABLE public.menu_items
ALTER COLUMN price_all SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'menu_items_price_all_nonnegative'
  ) THEN
    ALTER TABLE public.menu_items
    ADD CONSTRAINT menu_items_price_all_nonnegative CHECK (price_all >= 0);
  END IF;
END $$;

UPDATE public.orders
SET variant = 'Jalapeno Cheddar w/ Aioli'
WHERE item = 'Burgers'
  AND variant IN ('JalapeÃ±o Cheddar w/ Aioli', 'Jalapeño Cheddar w/ Aioli', 'Jalapeno Cheddar Burger With Aioli');

UPDATE public.menu_items
SET variant = 'Jalapeno Cheddar w/ Aioli'
WHERE item = 'Burgers'
  AND variant IN ('JalapeÃ±o Cheddar w/ Aioli', 'Jalapeño Cheddar w/ Aioli', 'Jalapeno Cheddar Burger With Aioli')
  AND NOT EXISTS (
    SELECT 1
    FROM public.menu_items AS canonical
    WHERE canonical.item = 'Burgers'
      AND canonical.variant = 'Jalapeno Cheddar w/ Aioli'
  );

DELETE FROM public.menu_items
WHERE item = 'Burgers'
  AND variant IN ('JalapeÃ±o Cheddar w/ Aioli', 'Jalapeño Cheddar w/ Aioli', 'Jalapeno Cheddar Burger With Aioli')
  AND EXISTS (
    SELECT 1
    FROM public.menu_items AS canonical
    WHERE canonical.item = 'Burgers'
      AND canonical.variant = 'Jalapeno Cheddar w/ Aioli'
  );

INSERT INTO public.menu_items (item, variant, price_all, active) VALUES
  ('Appetizers', 'Beef Nachos', 800, true),
  ('Appetizers', 'Cheese Nachos', 550, true),
  ('Appetizers', 'Chicken Fingers', 590, true),
  ('Appetizers', 'Chicken Nachos', 800, true),
  ('Appetizers', 'Chicken Wings', 590, true),
  ('Appetizers', 'French Fries', 250, true),
  ('Appetizers', 'Mini Chimichanga', 650, true),
  ('Appetizers', 'Mozzarella Sticks', 450, true),
  ('Appetizers', 'Onion Rings', 400, true),
  ('Appetizers', 'Parmesan Truffle Fries', 480, true),
  ('Appetizers', 'Potato Wedges', 350, true),
  ('Beer & Cocktails', 'Aperol Spritz', 700, true),
  ('Beer & Cocktails', 'Corona', 450, true),
  ('Beer & Cocktails', 'EPOS Wheat', 350, true),
  ('Beer & Cocktails', 'Heineken', 350, true),
  ('Beer & Cocktails', 'Korca Beer', 280, true),
  ('Beer & Cocktails', 'Leffe Blonde', 400, true),
  ('Beer & Cocktails', 'Margarita', 650, true),
  ('Beer & Cocktails', 'Paulaner', 450, true),
  ('Breakfast', 'Breakfast Burrito', 790, true),
  ('Breakfast', 'Combo French Toast', 770, true),
  ('Breakfast', 'Combo Pancakes', 790, true),
  ('Breakfast', 'Combo Waffle', 790, true),
  ('Breakfast', 'English Breakfast', 820, true),
  ('Breakfast', 'French Toast', 620, true),
  ('Breakfast', 'Huevos Rancheros', 590, true),
  ('Breakfast', 'Oat Meal', 450, true),
  ('Breakfast', 'Tony''s Special Eggs', 690, true),
  ('Breakfast', 'Yoghurt Musli & Fruits', 520, true),
  ('Breakfast Sandwiches', 'Bacon, Egg & Cheese Sandwich', 350, true),
  ('Breakfast Sandwiches', 'Egg, Guacamole On Toast', 590, true),
  ('Breakfast Sandwiches', 'Ham, Egg & Cheese Sandwich', 250, true),
  ('Breakfast Sandwiches', 'Salmon, Scrambled Egg, Guacamole, Cream Cheese Toast', 780, true),
  ('Burgers', 'Bacon Cheeseburger', 850, true),
  ('Burgers', 'BBQ Onion Ring Burger', 920, true),
  ('Burgers', 'BBQ Pork Sandwich', 890, true),
  ('Burgers', 'Caramelised Onion Blue Cheese Burger', 780, true),
  ('Burgers', 'Cheeseburger', 750, true),
  ('Burgers', 'Chicken Burger', 650, true),
  ('Burgers', 'Club Sandwich', 720, true),
  ('Burgers', 'Deluxe Burger', 1290, true),
  ('Burgers', 'Fried Chicken Delight', 720, true),
  ('Burgers', 'Hamburger', 680, true),
  ('Burgers', 'Jack Daniel''s', 990, true),
  ('Burgers', 'Jalapeno Cheddar w/ Aioli', 850, true),
  ('Burgers', 'Mexican Burger', 890, true),
  ('Burgers', 'Philly Cheesesteak', 890, true),
  ('Burgers', 'Spicy Chicken Sandwich', 720, true),
  ('Burgers', 'Veggie Burger', 650, true),
  ('Coffee & Tea', 'Cafe Latte', 320, true),
  ('Coffee & Tea', 'Cappuccino', 220, true),
  ('Coffee & Tea', 'Espresso Coffee', 130, true),
  ('Coffee & Tea', 'Fresh Brewed Coffee', 150, true),
  ('Coffee & Tea', 'Hot Chocolate', 250, true),
  ('Coffee & Tea', 'Iced Cafe Latte', 320, true),
  ('Coffee & Tea', 'Iced Mocha', 350, true),
  ('Coffee & Tea', 'Macchiato', 140, true),
  ('Coffee & Tea', 'Matcha Latte', 370, true),
  ('Coffee & Tea', 'Matcha Tea', 260, true),
  ('Coffee & Tea', 'Mocha Latte', 350, true),
  ('Coffee & Tea', 'Tea', 150, true),
  ('Eggs Benedict', 'Avocado Benedict', 890, true),
  ('Eggs Benedict', 'Classic Benedict', 750, true),
  ('Eggs Benedict', 'Florentine Benedict', 890, true),
  ('Eggs Benedict', 'Smoked Salmon Benedict', 980, true),
  ('Enchilada', 'Beef', 850, true),
  ('Enchilada', 'Chicken', 850, true),
  ('Entrees', 'BBQ Chicken Fillet', 890, true),
  ('Entrees', 'BBQ Pork Ribs', 1390, true),
  ('Entrees', 'Fried Chicken', 890, true),
  ('Entrees', 'Grilled Chicken Fillet', 700, true),
  ('Entrees', 'Grilled Salmon Fillet & Quinoa Salad', 1490, true),
  ('Entrees', 'Parmigan Chicken', 890, true),
  ('Extras', 'Aioli', 60, true),
  ('Extras', 'Bacon', 250, true),
  ('Extras', 'BBQ Sauce', 100, true),
  ('Extras', 'Guacamole', 150, true),
  ('Extras', 'Hash browns', 180, true),
  ('Extras', 'Honey Mustard', 60, true),
  ('Extras', 'Jack Daniel''s Sauce', 100, true),
  ('Extras', 'Jalapeno', 100, true),
  ('Extras', 'Ketchup', 60, true),
  ('Extras', 'Maple Syrup', 50, true),
  ('Extras', 'Marinara Sauce', 50, true),
  ('Extras', 'Mayonesse', 60, true),
  ('Extras', 'Mustard', 60, true),
  ('Extras', 'Nutella', 50, true),
  ('Extras', 'Pico de Gallo', 60, true),
  ('Extras', 'Sour Cream', 50, true),
  ('Extras', 'Sriracha', 100, true),
  ('Extras', 'Sweet Chilly', 100, true),
  ('Juices & Smoothies', 'Fresh Apple Juice', 380, true),
  ('Juices & Smoothies', 'Fresh Carrot Juice', 400, true),
  ('Juices & Smoothies', 'Fresh Orange Juice', 380, true),
  ('Juices & Smoothies', 'Milk Shake', 380, true),
  ('Juices & Smoothies', 'Mix Juice', 400, true),
  ('Juices & Smoothies', 'Smoothies', 380, true),
  ('Juices & Smoothies', 'Water', 100, true),
  ('Mexican', 'Burritos (Chicken or Birria Beef)', 930, true),
  ('Mexican', 'Quesadilla (Chicken or Beef)', 750, true),
  ('Mexican', 'Taco', 950, true),
  ('Omelettes', '2 Eggs Any Style', 220, true),
  ('Omelettes', 'Bacon Avocado Omelette', 750, true),
  ('Omelettes', 'Ham & Cheese Omelette', 550, true),
  ('Omelettes', 'Mexican Omelette', 720, true),
  ('Omelettes', 'Mushroom Bacon Brie Omelette', 820, true),
  ('Omelettes', 'Santa Fe Omelette', 550, true),
  ('Omelettes', 'Smoked Salmon Omelette', 890, true),
  ('Omelettes', 'Vegetarian Omelette', 520, true),
  ('Omelettes', 'Western Omelette', 600, true),
  ('Pancakes', 'Apple Pancake', 650, true),
  ('Pancakes', 'Banana Pancake', 650, true),
  ('Pancakes', 'Blueberry Pancakes', 800, true),
  ('Pancakes', 'Chocolate Chip Pancake', 750, true),
  ('Pancakes', 'Plain Pancakes', 620, true),
  ('Pancakes', 'Strawberry Pancakes', 800, true),
  ('Pancakes', 'Walnut Pancakes', 720, true),
  ('Salads', 'Avocado Salad', 650, true),
  ('Salads', 'Bacon, Bleu Cheese & Walnut', 650, true),
  ('Salads', 'Chicken Caesar Salad', 650, true),
  ('Salads', 'Greek Salad', 580, true),
  ('Salads', 'Quinoa Salad', 670, true),
  ('Salads', 'Tony''s Beautiful Salad', 650, true),
  ('Sodas', 'Coke', 220, true),
  ('Sodas', 'Coke Zero', 220, true),
  ('Sodas', 'Dr Pepper', 280, true),
  ('Sodas', 'Fanta Exotic', 220, true),
  ('Sodas', 'Fanta Orange', 220, true),
  ('Sodas', 'Lemon Iced Tea', 220, true),
  ('Sodas', 'Peach Iced Tea', 220, true),
  ('Sodas', 'Sprite', 220, true),
  ('Soup & Specials', 'Beef Noodles Soup', 270, true),
  ('Soup & Specials', 'Linguine Bolognese', 420, true),
  ('Waffles', 'Nutella Waffle', 720, true),
  ('Waffles', 'Plain Waffles', 620, true),
  ('Waffles', 'Strawberry Waffle', 790, true),
  ('Waffles', 'Waffle With Fresh Fruit', 690, true)
ON CONFLICT (item, variant) DO UPDATE
SET price_all = EXCLUDED.price_all;
