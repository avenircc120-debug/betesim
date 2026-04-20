import { createClient } from "@supabase/supabase-js";
import { logger } from "./logger";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  logger.warn("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set — Supabase client will not work");
}

export const supabase = createClient(
  supabaseUrl ?? "",
  supabaseServiceKey ?? "",
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);
