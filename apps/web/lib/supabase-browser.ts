'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let supabase: SupabaseClient | null = null;

export const isSupabaseConfigured = Boolean(
  url &&
  key &&
  !url.includes('your-project')
);

export function getSupabase() {
  if (!isSupabaseConfigured) {
    throw new Error(
      'Supabase n’est pas configuré. Ajoutez NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_ANON_KEY dans .env.local, puis redémarrez le serveur.'
    );
  }

  if (!supabase) {
    supabase = createBrowserClient(url!, key!);
  }

  return supabase;
}