import { createClient } from "@supabase/supabase-js"

export function createServerClient() {
  // Use service role key if available (for admin operations)
  // Otherwise fall back to anon key (requires proper RLS/storage policies)
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    supabaseKey!
  )
}

