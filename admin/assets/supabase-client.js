import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const config = window.__ADMIN_CONFIG__ || {};
const FIXED_ADMIN_EMAIL = "sdgb.union@gmail.com";

export function getConfig() {
  return config;
}

export function validateConfig() {
  if (!config.supabaseUrl || !config.supabaseAnonKey) {
    throw new Error(
      "Missing config. Create admin/config.local.js from admin/config.example.js",
    );
  }
}

export function isClientEmailAllowed(email) {
  const normalized = String(email || "").trim().toLowerCase();
  return normalized === FIXED_ADMIN_EMAIL;
}

export function getFixedAdminEmail() {
  return FIXED_ADMIN_EMAIL;
}

validateConfig();

export const supabase = createClient(config.supabaseUrl, config.supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
