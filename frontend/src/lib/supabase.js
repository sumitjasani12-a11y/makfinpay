import { createClient } from "@supabase/supabase-js";

const DEFAULT_SUPABASE_URL = "https://zpynrddggarkltuueqdk.supabase.co";
const DEFAULT_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpweW5yZGRnZ2Fya2x0dXVlcWRrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU2NzEzNzYsImV4cCI6MjEwMTI4NzM3Nn0.mzhX2HjqbiOEZ52w_hozGF3T58dsGCviukUzxVw3q18";
const DEFAULT_SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpweW5yZGRnZ2Fya2x0dXVlcWRrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NTY3MTM3NiwiZXhwIjoyMTAxMjQ3Mzc2fQ._y2imQXpDPLkm9805uTbZE9jQEml6xUkCD7JKbvNh2g";

let cachedAnonClient = null;
let cachedAdminClient = null;
let lastToken = null;

export const getSupabase = () => {
  let url = process.env.REACT_APP_SUPABASE_URL || DEFAULT_SUPABASE_URL;
  let key = process.env.REACT_APP_SUPABASE_ANON_KEY || DEFAULT_ANON_KEY;
  const token = localStorage.getItem("mfp_token");

  if (cachedAnonClient && lastToken === token) {
    return cachedAnonClient;
  }

  try {
    lastToken = token;
    cachedAnonClient = createClient(url, key, {
      global: {
        headers: {
          Authorization: token ? `Bearer ${token}` : undefined,
        },
      },
      realtime: {
        params: {
          eventsPerSecond: 10,
        },
      },
    });
    return cachedAnonClient;
  } catch (e) {
    console.warn("Supabase client initialization failed:", e);
    return null;
  }
};

export const getSupabaseAdmin = () => {
  if (cachedAdminClient) return cachedAdminClient;
  let url = process.env.REACT_APP_SUPABASE_URL || DEFAULT_SUPABASE_URL;
  let key = process.env.REACT_APP_SUPABASE_SERVICE_ROLE_KEY || DEFAULT_SERVICE_KEY;
  try {
    cachedAdminClient = createClient(url, key, {
      auth: { persistSession: false },
      realtime: { params: { eventsPerSecond: 10 } }
    });
    return cachedAdminClient;
  } catch (e) {
    console.warn("Supabase Admin client initialization failed:", e);
    return null;
  }
};

export const supabaseRpc = async (fnName, params = {}) => {
  const supabase = getSupabase();
  if (!supabase) return { data: null, error: new Error("Supabase client unavailable") };
  return await supabase.rpc(fnName, params);
};
