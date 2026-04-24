import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://volttdmajbkejgroxued.supabase.co'
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_Vqp1B7oiDj9xKu0-lQ1bsQ_aFDKfvhY'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
export const ROTATION_STATE_ID = 'shared'
