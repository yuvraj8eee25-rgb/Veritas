/* =========================================================
   SUPABASE CONFIG
   Replace the values below with your own Supabase project's
   URL and anon public key (Supabase Dashboard → Project Settings
   → API → Project URL / anon public key).
   ========================================================= */
const SUPABASE_URL = "https://mhxaafgvlbtgdvecsmei.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_CI0f6okRbUp-WXqljZ2f_Q_0hJaiaZX";

const mpClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Every player is signed in anonymously — no login screen needed.
// This gives each device a stable uid to identify players/turns by.
// Requires Dashboard → Authentication → Providers → Anonymous → enabled.
const mpReady = new Promise((resolve) => {
  mpClient.auth.onAuthStateChange((_event, session) => {
    if (session && session.user) resolve(session.user.id);
  });

  mpClient.auth.getSession().then(({ data }) => {
    if (data.session && data.session.user) {
      resolve(data.session.user.id);
    } else {
      mpClient.auth.signInAnonymously().catch((err) => {
        console.error("Anonymous sign-in failed:", err);
      });
    }
  });
});

window.mpSupabase = { client: mpClient, ready: mpReady };
