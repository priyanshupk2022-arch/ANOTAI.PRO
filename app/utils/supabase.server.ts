import { createClient } from "@supabase/supabase-js";

// Ensure environment variables exist
if (!process.env.SUPABASE_URL) throw new Error("SUPABASE_URL is missing");
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY is missing");

// Use the service role key to bypass RLS for server-side agent actions
export const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);
