-- Add timeframe settings to the settings table
INSERT INTO settings (key, value, updated_at) VALUES 
  ('ordering_start_time', '09:00', NOW()),
  ('ordering_end_time', '12:30', NOW())
ON CONFLICT (key) DO UPDATE SET 
  value = EXCLUDED.value,
  updated_at = NOW();
