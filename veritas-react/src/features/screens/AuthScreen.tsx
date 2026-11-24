import { ArrowRight, Check, LoaderCircle, Moon, Sun } from "lucide-react";
import { useVeritasTheme } from "../../lib/use-veritas-theme";
type ScreenState = Record<string, any>;

export default function AuthScreen({ state }: { state: ScreenState }) {
  const { theme, toggleTheme } = useVeritasTheme();
    const { busy, confirmPassword, email, error, isSupabaseConfigured, message, mode, password, sessionEmail, setConfirmPassword, setEmail, setError, setGuestMode, setMessage, setMode, setPassword, signOut, submit } = state;
  return (
    <main className="auth-page">
      <button className="auth-theme-toggle" type="button" onClick={toggleTheme} aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"} aria-pressed={theme === "dark"}>{theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}{theme === "dark" ? "Light mode" : "Dark mode"}</button>
      <div className="ambient ambient-one" aria-hidden="true" />
      <div className="ambient ambient-two" aria-hidden="true" />
      <section className="auth-layout" aria-labelledby="brand-title">
        <div className="brand-panel">
          <div className="brand-mark" aria-hidden="true"><Check size={29} strokeWidth={2.2} /></div>
          <p className="eyebrow">THINK CLEARER. ARGUE BETTER.</p>
          <h1 id="brand-title">VERITAS</h1>
          <p className="brand-copy">Practice the art of making a case. Learn to test ideas, weigh evidence, and meet strong arguments with stronger ones.</p>
          <div className="brand-note"><span className="note-line" />A better argument starts with a better question.</div>
        </div>
        <div className="auth-card">
          {sessionEmail ? (
            <div className="signed-in">
              <span className="eyebrow">ACCOUNT READY</span>
              <h2>Welcome back.</h2>
              <p>Signed in as <strong>{sessionEmail}</strong></p>
              <p className="migration-note">The React shell is set up. The next migration step will bring over your Home dashboard.</p>
              <button className="button button-secondary" onClick={signOut}>Sign out <ArrowRight size={16} /></button>
            </div>
          ) : (
            <>
              <div className="card-heading">
                <span className="eyebrow">YOUR PRACTICE, YOUR PROGRESS</span>
                <h2>{mode === "signup" ? "Create your account" : mode === "forgot" ? "Reset your password" : mode === "reset" ? "Choose a new password" : "Welcome back"}</h2>
                <p>{mode === "signup" ? "Start building a stronger way to think." : mode === "forgot" ? "We’ll email you a link to get back in." : mode === "reset" ? "Use a strong password you have not used before." : "Sign in to continue your practice."}</p>
              </div>
              {mode === "login" || mode === "signup" ? <div className="tabs" role="tablist" aria-label="Account access">
                <button role="tab" aria-selected={mode === "login"} className={mode === "login" ? "tab active" : "tab"} onClick={() => { setMode("login"); setError(""); setMessage(""); }}>Log in</button>
                <button role="tab" aria-selected={mode === "signup"} className={mode === "signup" ? "tab active" : "tab"} onClick={() => { setMode("signup"); setError(""); setMessage(""); }}>Create account</button>
              </div> : null}
              <form onSubmit={submit}>
                {mode !== "reset" && <label className="field">Email address<input type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" /></label>}
                {mode !== "forgot" && <label className="field">{mode === "reset" ? "New password" : "Password"}<input type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} required minLength={6} value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 6 characters" /></label>}
                {mode === "reset" && <label className="field">Confirm new password<input type="password" autoComplete="new-password" required minLength={6} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Enter it again" /></label>}
                {error && <p className="feedback error" role="alert">{error}</p>}
                {message && <p className="feedback success" role="status">{message}</p>}
                <button className="button button-primary" type="submit" disabled={busy}>
                  {busy ? <LoaderCircle size={17} className="spin" /> : null}
                  {busy ? "Please wait" : mode === "signup" ? "Create account" : mode === "forgot" ? "Send reset link" : mode === "reset" ? "Update password" : "Sign in"}
                  {!busy && <ArrowRight size={17} />}
                </button>
              </form>
              <div className="auth-links">
                {mode === "login" && <button onClick={() => { setMode("forgot"); setError(""); setMessage(""); }}>Forgot password?</button>}
                {(mode === "forgot" || mode === "reset") && <button onClick={() => { setMode("login"); setError(""); setMessage(""); }}>Back to sign in</button>}
                {mode === "signup" && <p>Veritas is for teens (13–17) and adults. Teen live practice uses teacher-managed private assignments. Adults can opt into public matches in Profile. Read the help page for storage and AI processing details.</p>}
              </div>
              {mode === "login" && <button className="guest-link" type="button" onClick={()=>setGuestMode(true)}>Continue exploring as a guest</button>}
              {!isSupabaseConfigured && <p className="config-hint">Configure Supabase to enable account access.</p>}
            </>
          )}
        </div>
      <p className="workspace-meta"><a href="/learn">Try a free lesson</a> · <a href="/help">Help and data controls</a></p></section>
      <footer className="page-footer"><span>VERITAS</span><span>Practice with curiosity.</span></footer>
    </main>
  );
}
