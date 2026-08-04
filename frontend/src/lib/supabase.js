import { createClient } from "@supabase/supabase-js";

const DEFAULT_SUPABASE_URL = "https://itbtuduqkhgtfkwpamcw.supabase.co";
const DEFAULT_SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml0YnR1ZHVxa2hndGZrd3BhbWN3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ5OTg4NDAsImV4cCI6MjEwMDU3NDg0MH0.ui8OpPSqQQbGQ1htNEMtVK--3H2TSOfW49mNAGqu6vo";

export const getSupabase = () => {
  let url = process.env.REACT_APP_SUPABASE_URL;
  if (!url || typeof url !== "string" || !url.startsWith("http")) {
    url = DEFAULT_SUPABASE_URL;
  }
  let key = process.env.REACT_APP_SUPABASE_ANON_KEY;
  if (!key || typeof key !== "string" || key.length < 10) {
    key = DEFAULT_SUPABASE_KEY;
  }
  try {
    const token = localStorage.getItem("mfp_token");
    return createClient(url, key, {
      global: {
        headers: {
          Authorization: token ? `Bearer ${token}` : undefined,
        },
      },
    });
  } catch (e) {
    console.warn("Supabase client initialization skipped:", e);
    return null;
  }
};
