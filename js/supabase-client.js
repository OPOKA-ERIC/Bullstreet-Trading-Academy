import { createClient } from './vendor/supabase.esm.js'

const SUPABASE_URL = 'https://bjariigetjvymnvkkesh.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJqYXJpaWdldGp2eW1udmtrZXNoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEwMjEyMDMsImV4cCI6MjEwNjU5NzIwM30.vFcfB620fnJIbUuT28jmlA978pRTGVXTwqyxfBSU1Z4'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
