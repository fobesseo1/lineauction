"use client";
import { createBrowserClient } from "@supabase/ssr";
import { getPublicEnv } from "@/lib/env/public";
export function createClient() {
  const env = getPublicEnv();
  return createBrowserClient(env.url, env.anonKey);
}
