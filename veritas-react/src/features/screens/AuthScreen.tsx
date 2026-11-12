import type { FormEvent } from "react";
import { ArrowRight, LoaderCircle } from "lucide-react";

type AuthMode = "login" | "signup" | "forgot" | "reset";
type AuthState = {
  busy: boolean;
  confirmPassword: string;
  email: string;
  error: string;
  isSupabaseConfigured: boolean;
  message: string;
  mode: AuthMode;
  password: string;
  setConfirmPassword: (value: string) => void;
  setEmail: (value: string) => void;
  setError: (value: string) => void;
  setGuestMode: (value: boolean) => void;
  setMessage: (value: string) => void;
  setMode: (value: AuthMode) => void;
  setPassword: (value: string) => void;
  submit: (event: FormEvent<HTMLFormElement>) => void;
};

const access = {
  login: { title: "Sign in", description: "Continue your practice and access your account.", action: "Sign in" },
  signup: { title: "Create an account", description: "Join debates, investigate claims, and take part in Classroom.", action: "Create account" },
  forgot: { title: "Reset your password", description: "Enter your email to receive a reset link.", action: "Send reset link" },
  reset: { title: "Choose a new password", description: "Use at least six characters.", action: "Update password" },
};

export default function AuthScreen({ state }: { state: AuthState }) {
  const {
    busy, confirmPassword, email, error, isSupabaseConfigured, message, mode, password,
    setConfirmPassword, setEmail, setError, setGuestMode, setMessage, setMode, setPassword, submit,
  } = state;
  const copy = access[mode];
  function changeMode(next: AuthMode) {
    setError("");
    setMessage("");
    setMode(next);
  }

  return (
    <main className="access-page">
      <div className="access-layout">
        <section className="access-intro" aria-labelledby="access-intro-title">
          <div className="access-brand"><span className="workspace-monogram" aria-hidden="true">V</span>Veritas</div>
          <h1 id="access-intro-title">A workspace for better arguments</h1>
          <p>Practise rebuttals, weigh evidence, and see how your reasoning holds up in a debate.</p>
          <blockquote className="access-example">
            <p>“Everyone I know agrees, so it must be true.”</p>
            <footer>Fallacy Hunter · Can you spot the flaw?</footer>
          </blockquote>
        </section>
        <section className="access-panel" aria-labelledby="access-title">
          <h2 id="access-title">{copy.title}</h2>
          <p className="workspace-lead">{copy.description}</p>
          {!isSupabaseConfigured && <p className="workspace-note" role="status">Account services are unavailable in this installation. Guest practice is available.</p>}
          {isSupabaseConfigured && <>
            <form onSubmit={submit}>
              {mode !== "reset" && <label className="workspace-field">Email address
                <input type="email" autoComplete="email" required value={email} onChange={event => setEmail(event.target.value)} />
              </label>}
              {mode !== "forgot" && <label className="workspace-field">{mode === "reset" ? "New password" : "Password"}
                <input type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} required minLength={6} value={password} onChange={event => setPassword(event.target.value)} />
              </label>}
              {mode === "reset" && <label className="workspace-field">Confirm new password
                <input type="password" autoComplete="new-password" required minLength={6} value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} />
              </label>}
              {error && <p className="workspace-error" role="alert">{error}</p>}
              {message && <p className="workspace-note" role="status">{message}</p>}
              <button className="workspace-primary" type="submit" disabled={busy}>
                {busy ? <><LoaderCircle size={16} className="spinner" aria-hidden="true" /> Please wait</> : <>{copy.action}<ArrowRight size={17} aria-hidden="true" /></>}
              </button>
            </form>
            <div className="access-actions">
              {mode === "login" ? <>
                <button type="button" className="workspace-text-action" onClick={() => changeMode("signup")}>Create an account</button>
                <button type="button" className="workspace-text-action" onClick={() => changeMode("forgot")}>Forgot password?</button>
              </> : <button type="button" className="workspace-text-action" onClick={() => changeMode("login")}>Back to sign in</button>}
            </div>
          </>}
          {(mode === "login" || !isSupabaseConfigured) && <div className="access-guest">
            <button className={isSupabaseConfigured ? "workspace-secondary" : "workspace-primary"} type="button" onClick={() => setGuestMode(true)}>
              Continue as guest <ArrowRight size={16} aria-hidden="true" />
            </button>
            <p className="workspace-meta">Practice progress stays on this device.</p>
          </div>}
        </section>
      </div>
    </main>
  );
}
