import "server-only";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { getPublicEnv } from "@/lib/env/public";
export function createAdminClient() {
  const key = z.string().min(1).parse(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY);
  return createClient(getPublicEnv().url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
