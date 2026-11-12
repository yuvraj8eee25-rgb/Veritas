import { useEffect, useRef, useState, type ReactNode } from "react";
import { BookOpen, Gamepad2, Ellipsis, Flame, GraduationCap, House, LogOut, Menu, MessageSquare, PanelLeftClose, PanelLeftOpen, Search, Swords, Trophy, UserRound, WifiOff, X, Zap } from "lucide-react";
import { Dialog } from "radix-ui";

export type View = "home" | "setup" | "daily" | "profile" | "leaderboard" | "study" | "classroom" | "evidence" | "ai-setup" | "ai-room" | "ai-result" | "live-lobby" | "live-search" | "live-room" | "game" | "summary" | "arcade";
export type Destination = Exclude<View, "game" | "summary" | "ai-room" | "ai-result" | "live-search" | "live-room">;

const groups = [
  { name: "Learn", items: [
    { id: "home", label: "Home", icon: House },
    { id: "setup", label: "Practice", icon: Zap },
    { id: "study", label: "Study", icon: BookOpen },
    { id: "daily", label: "Daily Challenge", icon: Flame },
  ] },
  { name: "Compete", items: [
    { id: "ai-setup", label: "Debate AI", icon: MessageSquare },
    { id: "live-lobby", label: "Live Debate", icon: Swords },
    { id: "leaderboard", label: "Leaderboard", icon: Trophy },
    { id: "arcade", label: "Arcade", icon: Gamepad2 },
  ] },
  { name: "Research", items: [{ id: "evidence", label: "Evidence Lab", icon: Search }] },
  { name: "Manage", items: [
    { id: "classroom", label: "Classroom", icon: GraduationCap },
    { id: "profile", label: "Profile", icon: UserRound },
  ] },
] as const;

const destinations = groups.flatMap<{ id: Destination; label: string; icon: typeof House }>(group => [...group.items]);
const primary = ["home", "setup", "ai-setup", "evidence"] as const;
const shortLabels = { home: "Home", setup: "Practice", "ai-setup": "Debate", evidence: "Evidence" };

function destinationFor(view: View): Destination {
  if (view === "game" || view === "summary") return "setup";
  if (view === "ai-room" || view === "ai-result") return "ai-setup";
  if (view === "live-search" || view === "live-room") return "live-lobby";
  return view;
}

export default function AppShell({ view, guest, account, navigate, signOut, children }: {
  view: View;
  guest: boolean;
  account: string;
  navigate: (destination: Destination) => void;
  signOut: () => void;
  children: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [offline, setOffline] = useState(() => !navigator.onLine);
  const main = useRef<HTMLElement>(null);
  const tabletMenu = useRef<HTMLButtonElement>(null);
  const mobileMenu = useRef<HTMLButtonElement>(null);
  const focusContent = useRef(false);
  const previousView = useRef(view);
  const current = destinationFor(view);
  const label = destinations.find(item => item.id === current)?.label;

  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  useEffect(() => {
    if (previousView.current === view) return;
    previousView.current = view;
    window.scrollTo(0, 0);
    main.current?.focus({ preventScroll: true });
  }, [view]);

  const navigation = (onChoose: (destination: Destination) => void) => groups.map(group => (
    <div className="workspace-nav-group" key={group.name} role="group" aria-label={group.name}>
      <span className="workspace-nav-heading" aria-hidden="true">{group.name}</span>
      {group.items.map(({ id, label, icon: Icon }) => (
        <button type="button" key={id} className="workspace-nav-item" aria-current={current === id ? "page" : undefined}
          aria-label={label} title={label} onClick={() => onChoose(id)}>
          <Icon size={18} aria-hidden="true" /><span>{label}</span>
        </button>
      ))}
    </div>
  ));

  return (
    <Dialog.Root open={menuOpen} onOpenChange={setMenuOpen}>
      <div className="workspace-shell" data-collapsed={collapsed}>
        <a className="workspace-skip" href="#workspace-content">Skip to content</a>
        <aside className="workspace-sidebar">
          <button type="button" className="workspace-wordmark" onClick={() => navigate("home")} aria-label="Veritas home">
            <span className="workspace-monogram" aria-hidden="true">V</span><strong>Veritas</strong>
          </button>
          <nav aria-label="Workspace">{navigation(navigate)}</nav>
          <button type="button" className="workspace-nav-item workspace-account" onClick={signOut} aria-label={guest ? "Return to sign in" : "Sign out"}>
            <LogOut size={18} aria-hidden="true" /><span>{guest ? "Return to sign in" : "Sign out"}</span>
          </button>
        </aside>
        <div className="workspace-body">
          <header className="workspace-top">
            <div className="workspace-location">
              <button type="button" className="workspace-icon-button workspace-collapse" aria-expanded={!collapsed}
                aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} onClick={() => setCollapsed(value => !value)}>
                {collapsed ? <PanelLeftOpen size={19} /> : <PanelLeftClose size={19} />}
              </button>
              <button type="button" className="workspace-icon-button workspace-tablet-menu" ref={tabletMenu} aria-haspopup="dialog"
                aria-expanded={menuOpen} aria-label="Open navigation" onClick={() => setMenuOpen(true)}><Menu size={20} /></button>
              <span className="workspace-location-brand">Veritas</span>
              <span className="workspace-location-divider" aria-hidden="true">/</span>
              <span>{label}</span>
            </div>
            <button type="button" className="workspace-account-link" onClick={() => navigate("profile")}>
              <UserRound size={16} aria-hidden="true" /><span>{guest ? "Guest practice" : account}</span>
            </button>
          </header>
          {offline && <p className="workspace-banner" role="status"><WifiOff size={17} aria-hidden="true" /> Offline. Practice is available on this device. Connected features require internet access.</p>}
          <main className="workspace-content" id="workspace-content" tabIndex={-1} ref={main}>{children}</main>
        </div>
        <nav className="workspace-mobile" aria-label="Primary navigation">
          {primary.map(id => {
            const Icon = destinations.find(item => item.id === id)!.icon;
            return <button type="button" key={id} aria-current={current === id ? "page" : undefined} onClick={() => navigate(id)}>
              <Icon size={19} aria-hidden="true" /><span>{shortLabels[id]}</span>
            </button>;
          })}
          <Dialog.Trigger asChild><button type="button" ref={mobileMenu}><Ellipsis size={20} aria-hidden="true" /><span>More</span></button></Dialog.Trigger>
        </nav>
      </div>
      <Dialog.Portal>
        <Dialog.Overlay className="workspace-menu-overlay" />
        <Dialog.Content className="workspace-menu" aria-describedby={undefined} onCloseAutoFocus={event => {
          event.preventDefault();
          if (focusContent.current) {
            focusContent.current = false;
            main.current?.focus({ preventScroll: true });
          } else {
            const trigger = mobileMenu.current?.getClientRects().length ? mobileMenu.current : tabletMenu.current;
            trigger?.focus();
          }
        }}>
          <header><Dialog.Title>Workspace navigation</Dialog.Title><Dialog.Close asChild>
            <button className="workspace-icon-button" aria-label="Close navigation"><X size={20} /></button>
          </Dialog.Close></header>
          <nav aria-label="All destinations">{navigation(destination => {
            focusContent.current = destination !== current;
            setMenuOpen(false);
            navigate(destination);
          })}</nav>
          <button type="button" className="workspace-nav-item" onClick={() => { setMenuOpen(false); signOut(); }}>
            <LogOut size={18} aria-hidden="true" /><span>{guest ? "Return to sign in" : "Sign out"}</span>
          </button>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
