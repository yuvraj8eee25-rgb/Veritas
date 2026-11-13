# Authentication and guest access

## 1. Purpose

Let learners sign in or create an account, recover access, and use guest mode for device-local practice. Authentication is currently a set of modes inside the root client app, not a dedicated URL. The vanilla app also has a separate `splash` screen; React enters through the auth/Home flow instead.

## 2. Current problems

- Login, signup, forgot-password, and reset modes share one large screen branch in `src/App.tsx`; the URL does not identify the current auth step.
- The auth page uses a radial gradient, blurred ambient elements, and a glass-like card (`.auth-page`, `.ambient`, `.auth-card` in `src/styles.css`), while the target direction is flat.
- Several visible strings in `src/App.tsx` contain corrupted punctuation; auth copy should be checked during the UI pass.

## 3. Target design

- Use Radix Tabs for Sign in / Sign up. “Forgot password” is a text link below Password. Use a two-column desktop layout: concise product/context panel and a 440 px auth card; stack into one column below 800 px.
- Use Inter for labels/body, Space Grotesk for the page heading, and 44 px controls. Keep one primary action per auth mode.
- Keep the submit Button enabled when the form is invalid; validate on submit and show field errors beside the invalid fields. During an active request, show submitting/loading feedback and prevent duplicate submission.
- States: initial empty form; field-level validation; submitting/loading; invalid credentials/provider error inline; signup confirmation success; recovery email sent; reset success; Supabase-unconfigured error with a clear setup message; guest continuation confirmation. Guest mode must state that progress is local to this browser and distinguish guest from signed-in status.

### Wireframe: Auth (two states)

```text
1366 x 768 | Sidebar hidden on auth | centered PageShell
+------------------------------------------------------------------------+
| TopBar 64 px [Badge brand; Text secondary]                              |
| PageShell [Background #080D18]                                         |
| Context block 360 px [Space Grotesk H1 / Text primary]                 |
| Supporting copy [Inter 15/23]                                           |
|            +--------------------------------------------+              |
|            | Card 440 px [Surface #0D1622; 24 px pad]   |              |
|            | Tabs: Sign in | Sign up [Radix Tabs]       |              |
|            | Input Email 44 px [Border strong]         |              |
|            | Input Password 44 px [Border strong]      |              |
|            | Button show/hide password [Tertiary]       |              |
|            | Forgot password text link [Text secondary]|              |
|            | primary Button “Sign in” 44 px [Accent]    |              |
|            | guest link [Text secondary]               |              |
|            +--------------------------------------------+              |
+------------------------------------------------------------------------+
DEFAULT: empty Inputs, Sign in selected, submit Button enabled.
VALIDATION ERROR: on submit, field errors appear beside invalid Inputs [Danger].
Primary action: Button “Sign in” (Sign up tab changes its action).
At 320 px, context block stacks above the 440 px max-width Card.
```

## 4. Components used

- Existing: `Input`, `Button`, `Card` in `src/components/ui/`.
- Target: Radix Tabs for Sign in / Sign up; “Forgot password” is a text link. Use `aria-live` for success/error messages.

## 5. Files involved

- `src/App.tsx` (auth modes and Supabase calls)
- `src/lib/supabase.ts`
- `src/components/ui/input.tsx`
- `src/components/ui/button.tsx`
- `src/components/ui/card.tsx`
- `src/styles.css`
- `../app/src/features/auth.js` (legacy auth behavior)

## 6. Done when

- [ ] At 1366x768, the primary submit action is visible without scrolling; the auth card is 440 px wide on desktop and fits 320 px without horizontal scrolling.
- [ ] Radix Tabs switches Sign in / Sign up with arrow keys; Forgot password is a text link and recovery/reset are reachable from it.
- [ ] Invalid, submitting, provider error, confirmation, recovery-sent, reset-success, and guest states each render one announced message and a usable next action.
- [ ] Password show/hide works with mouse and keyboard; email/password fields support browser autofill.
- [ ] Guest progress is explicitly described as saved locally to this browser.
- [ ] Keyboard reaches inputs, tabs, password visibility controls, links, and submit in logical order.
- [ ] selectors for this feature removed from src/styles.css.
