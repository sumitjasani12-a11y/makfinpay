import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL || "https://itbtuduqkhgtfkwpamcw.supabase.co";
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml0YnR1ZHVxa2hndGZrd3BhbWN3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ5OTg4NDAsImV4cCI6MjEwMDU3NDg0MH0.ui8OpPSqQQbGQ1htNEMtVK--3H2TSOfW49mNAGqu6vo";

export const getSupabase = () => {
  const token = localStorage.getItem("mfp_token");
  return createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: token ? `Bearer ${token}` : undefined,
      },
    },
  });
};
