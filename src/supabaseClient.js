import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://huwdwtptkxrnwslmbvid.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_XrWYpxUiuDI3c0HMK_7uGg_xhGwPGtR';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

