import { createClient } from "@supabase/supabase-js";

/* =========================================================
   SUPABASE CONFIG
   Replace the values below with your own Supabase project's
   URL and anon public key (Supabase Dashboard → Project Settings
   → API → Project URL / anon public key).
   ========================================================= */
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const mpClient = SUPABASE_URL && SUPABASE_ANON_KEY
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;
if (!mpClient) console.warn("Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env.local.");
const missingConfigError = () => new Error("Supabase isn't configured. Copy .env.example to .env.local and add your project URL and anon/publishable key.");

// The ready promise resolves with the active user ID.
// Unlike the anonymous model, it does not auto-sign in.
// If the user logs out, the promise is reset to a new pending state.
let resolveReady;
let readyPromise = new Promise((resolve) => {
  resolveReady = resolve;
});

// Check session on load
mpClient?.auth.getSession().then(({ data }) => {
  if (data.session && data.session.user) {
    resolveReady(data.session.user.id);
  }
});

// Listen to auth changes
mpClient?.auth.onAuthStateChange((event, session) => {
  if (event === "PASSWORD_RECOVERY") {
    // The user clicked the emailed reset link. Supabase has already signed
    // them into a temporary recovery session — don't treat that as a normal
    // login. Flag it so app.js's init() sends them to the "set new
    // password" form instead of Home, and tell anyone already past init()
    // via a custom event (covers the case where the link is opened in a
    // tab that's already sitting on Home).
    window.mpSupabase.isPasswordRecovery = true;
    window.dispatchEvent(new CustomEvent("veritas:password-recovery"));
  }
  if (session && session.user) {
    resolveReady(session.user.id);
  } else if (event === "SIGNED_OUT") {
    readyPromise = new Promise((resolve) => {
      resolveReady = resolve;
    });
    window.mpSupabase.ready = readyPromise;
    window.mpSupabase.isPasswordRecovery = false;
  }
});

window.mpSupabase = {
  client: mpClient,
  ready: readyPromise,
  // True from the moment a PASSWORD_RECOVERY event fires until the user
  // either sets a new password (see updatePassword) or signs out. Checked
  // by app.js's init() so a recovery-link session lands on the "set new
  // password" form instead of Home.
  isPasswordRecovery: false,
  signUp: async (email, password) => {
    if (!mpClient) return { error: missingConfigError() };
    return mpClient.auth.signUp({ email, password });
  },
  signIn: async (email, password) => {
    if (!mpClient) return { error: missingConfigError() };
    return mpClient.auth.signInWithPassword({ email, password });
  },
  signOut: async () => {
    if (!mpClient) return { error: missingConfigError() };
    return mpClient.auth.signOut();
  },
  getSession: async () => {
    if (!mpClient) return null;
    const { data } = await mpClient.auth.getSession();
    return data.session;
  },
  // Sends the "reset your password" email. redirectTo points back at this
  // same page so the Supabase link lands the user right back in the app
  // (with a recovery session) rather than on some other page.
  resetPasswordForEmail: async (email) => {
    if (!mpClient) return { error: missingConfigError() };
    const redirectTo = window.location.origin + window.location.pathname;
    return mpClient.auth.resetPasswordForEmail(email, { redirectTo });
  },
  // Call once the user is in a PASSWORD_RECOVERY session and has typed a
  // new password. Clears the recovery flag on success so they proceed to
  // Home like a normal signed-in user.
  updatePassword: async (newPassword) => {
    if (!mpClient) return { error: missingConfigError() };
    const result = await mpClient.auth.updateUser({ password: newPassword });
    if (!result.error) {
      window.mpSupabase.isPasswordRecovery = false;
    }
    return result;
  }
};
