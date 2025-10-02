import { createClient } from '@supabase/supabase-js'
const supabaseUrl = 'https://apwtihxxaywskoipsctv.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFwd3RpaHh4YXl3c2tvaXBzY3R2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg4Nzc2MjksImV4cCI6MjA3NDQ1MzYyOX0.eFq4qfAm_4dlSaEIGkMwdHzwtymv4zeUWqQeg4tEo1g'
const supabase = createClient(supabaseUrl, SUPABASE_ANON_KEY)