import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { BookOpen, CalendarCheck, ChartNoAxesCombined, ChevronDown, CircleHelp, FlaskConical, GraduationCap, House, LogOut, Menu, MessageSquareText, Moon, PanelLeftClose, PanelLeftOpen, Scale, Sparkles, Sun, Swords, Target, UserRound, WifiOff, X } from "lucide-react";
import { useVeritasTheme } from "../lib/use-veritas-theme";

export type View = "home" | "setup" | "daily" | "profile" | "leaderboard" | "study" | "classroom" | "evidence" | "ai-setup" | "ai-room" | "ai-result" | "ai-evidence" | "live-lobby" | "live-search" | "live-room" | "game" | "summary" | "arcade";
export type Destination = Exclude<View, "game" | "summary" | "ai-room" | "ai-result" | "ai-evidence" | "live-search" | "live-room">;
const links = [
  { id: "home", label: "Home", icon: House, group: "" },
  { id: "setup", label: "Practice", icon: Target, group: "main" },
  { id: "study", label: "Learn", icon: BookOpen, group: "main" },
  { id: "evidence", label: "Evidence", icon: FlaskConical, group: "main" },
  { id: "ai-setup", label: "Debate the AI", icon: MessageSquareText, group: "debate" },
  { id: "live-lobby", label: "Live debate", icon: Swords, group: "debate" },
  { id: "classroom", label: "Classroom", icon: GraduationCap, group: "main" },
  { id: "daily", label: "Daily Challenge", icon: CalendarCheck, group: "more" },
  { id: "arcade", label: "Arcade", icon: Sparkles, group: "more" },
  { id: "leaderboard", label: "Leaderboard", icon: ChartNoAxesCombined, group: "more" },
  { id: "profile", label: "Profile", icon: UserRound, group: "Account" },
] as const;
function destinationFor(view: View): Destination {
  if (view === "game" || view === "summary") return "setup";
  if (view === "ai-room" || view === "ai-result" || view === "ai-evidence") return "ai-setup";
  if (view === "live-search" || view === "live-room") return "live-lobby";
  return view;
}
export default function AppShell({ view, guest, account, navigate, signOut, children }: {
  view: View; guest: boolean; practiceRuns: number; account: string;
  navigate: (destination: Destination) => void; signOut: () => void; children: ReactNode;
}) {
  const [expanded, setExpanded] = useState(() => { try { return localStorage.getItem("veritas-sidebar") !== "collapsed"; } catch { return true; } });
  const [mobile, setMobile] = useState(() => typeof window !== "undefined" && window.matchMedia("(max-width: 760px)").matches);
  const [menuOpen, setMenuOpen] = useState(false);
  const [offline, setOffline] = useState(false);
  const { theme, toggleTheme } = useVeritasTheme();
  const content = useRef<HTMLElement>(null);
  const sidebar = useRef<HTMLElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const menuOpener = useRef<HTMLButtonElement | null>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const accountMenu = useRef<HTMLDetailsElement>(null);
  const focusAfterClose = useRef<"menu" | "content">("menu");
  const current = destinationFor(view);
  const label = links.find(link => link.id === current)?.label ?? "Home";
  useEffect(() => {
    const media = window.matchMedia("(max-width: 760px)");
    const update = () => { setMobile(media.matches); setMenuOpen(false); };
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update(); window.addEventListener("online", update); window.addEventListener("offline", update);
    return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); };
  }, []);
  useEffect(() => { setMenuOpen(false); if(accountMenu.current) accountMenu.current.open=false; window.scrollTo(0, 0); const frame=window.requestAnimationFrame(()=>content.current?.focus({preventScroll:true})); return ()=>window.cancelAnimationFrame(frame); }, [view]);
  useEffect(() => {
    if (!mobile || !menuOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = window.requestAnimationFrame(() => closeButton.current?.focus({preventScroll:true}));
    const trap = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); focusAfterClose.current="menu"; setMenuOpen(false); }
      if (event.key !== "Tab") return;
      const items = [...(sidebar.current?.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),summary') ?? [])].filter(item=>{
        if (!item.getClientRects().length) return false;
        // Closed details may retain layout rectangles for their hidden contents.
        for (let parent=item.parentElement;parent && parent!==sidebar.current;parent=parent.parentElement) {
          if(parent instanceof HTMLDetailsElement && !parent.open && parent.querySelector(":scope > summary")!==item) return false;
        }
        return true;
      });
      const first = items[0]; const last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", trap);
    return () => { window.cancelAnimationFrame(frame); document.body.style.overflow = previousOverflow; document.removeEventListener("keydown", trap); window.requestAnimationFrame(()=>{ if(focusAfterClose.current==="content" || !window.matchMedia("(max-width: 760px)").matches) content.current?.focus({preventScroll:true}); else (menuOpener.current ?? menuButton.current)?.focus(); }); };
  }, [mobile, menuOpen]);
  const closeMenu = () => { focusAfterClose.current="menu"; setMenuOpen(false); };
  const openMenu = (event: MouseEvent<HTMLButtonElement>) => { menuOpener.current=event.currentTarget; focusAfterClose.current="menu"; setMenuOpen(true); };
  const go = (id: Destination) => { focusAfterClose.current="content"; setMenuOpen(false); if(accountMenu.current) accountMenu.current.open=false; if(current===id) { window.scrollTo(0,0); window.requestAnimationFrame(()=>content.current?.focus({preventScroll:true})); } else navigate(id); };
  const follow = (event: MouseEvent<HTMLAnchorElement>, id: Destination) => {
    if(event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button!==0) return;
    event.preventDefault(); go(id);
  };
  const showLabels = mobile || expanded;
  const toneFor = (id: Destination) => id==="study" ? "learn" : id==="evidence" ? "evidence" : id==="ai-setup" || id==="live-lobby" ? "debate" : id==="classroom" ? "classroom" : "practice";
  const navLink = (id: Destination) => {
    const link = links.find(item=>item.id===id)!;
    const Icon = link.icon;
    return <a href={`/workspace/${id}`} key={id} className={`nav-item ${current===id?"selected":""}`} data-tone={toneFor(id)} aria-label={link.label} aria-current={current===id?"page":undefined} title={!showLabels?link.label:undefined} onClick={event=>follow(event,id)}><span className="nav-initial" aria-hidden="true"><Icon size={21} strokeWidth={1.9} /></span><span>{link.label}</span></a>;
  };
  return <div className={`app-shell reference-shell ${expanded ? "sidebar-expanded" : "sidebar-collapsed"} ${menuOpen ? "navigation-open" : ""}`}>
    <a className="workspace-skip" href="#workspace-content" inert={mobile && menuOpen}>Skip to content</a>
    {mobile && menuOpen && <button className="navigation-scrim" tabIndex={-1} aria-label="Close navigation" onClick={closeMenu} />}
    <aside ref={sidebar} id="workspace-navigation" className="app-sidebar" aria-label="Workspace navigation" aria-hidden={mobile && !menuOpen ? true : undefined} inert={mobile && !menuOpen} role={mobile && menuOpen ? "dialog" : undefined} aria-modal={mobile && menuOpen ? true : undefined}>
      <div className="sidebar-heading"><button type="button" className="sidebar-brand" onClick={() => go("home")} aria-label="Veritas home"><Scale size={29} aria-hidden="true" /><strong>veritas<span>Make your case.</span></strong></button>
        <button ref={closeButton} className="sidebar-toggle" type="button" aria-label={mobile ? "Close navigation" : expanded ? "Collapse navigation" : "Expand navigation"} aria-expanded={mobile?undefined:expanded} onClick={() => {
          if (mobile) closeMenu(); else { setExpanded(value => !value); try { localStorage.setItem("veritas-sidebar", expanded ? "collapsed" : "expanded"); } catch {} }
        }}>{mobile ? <X size={19} /> : expanded ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}</button>
      </div>
      <nav aria-label="Main navigation"><div className="navigation-group">
        {(["home","setup","study","evidence"] as Destination[]).map(navLink)}
        <details className="navigation-explore" open={current==="ai-setup"||current==="live-lobby"}><summary className="nav-item" data-tone="debate" aria-label="Debate options" title={!showLabels?"Debate":undefined}><span className="nav-initial" aria-hidden="true"><Swords size={21} /></span><span>Debate</span><ChevronDown className="nav-disclosure-chevron" size={15} aria-hidden="true" /></summary><div className="navigation-subitems">{navLink("ai-setup")}{navLink("live-lobby")}</div></details>
        {navLink("classroom")}
        <details className="navigation-explore" open={["daily","arcade","leaderboard"].includes(current)}><summary className="nav-item" aria-label="More activities" title={!showLabels?"More":undefined}><span className="nav-initial" aria-hidden="true"><Sparkles size={21} /></span><span>More</span><ChevronDown className="nav-disclosure-chevron" size={15} aria-hidden="true" /></summary><div className="navigation-subitems">{links.filter(link=>link.group==="more").map(link=>navLink(link.id))}</div></details>
      </div></nav>
      <div className="sidebar-bottom">
        <a className="nav-item" href="/help" title={!showLabels?"Help & guide":undefined}><span className="nav-initial" aria-hidden="true"><CircleHelp size={21} /></span><span>Help & guide</span></a>
        <details ref={accountMenu} className="navigation-explore account-menu"><summary className="nav-item" aria-label="Account menu" title={!showLabels?account:undefined}><span className="nav-initial account-avatar" aria-hidden="true"><UserRound size={21} /></span><span>{guest?"Guest account":account}</span><ChevronDown className="nav-disclosure-chevron" size={15} aria-hidden="true" /></summary><div className="account-menu-items">
        <a href="/workspace/profile" className={`nav-item ${current==="profile"?"selected":""}`} aria-current={current==="profile"?"page":undefined} onClick={event=>follow(event,"profile")}><span className="nav-initial" aria-hidden="true"><UserRound size={19} /></span><span>Profile & preferences</span></a>
        <button type="button" className="nav-item theme-toggle" aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"} aria-pressed={theme === "dark"} title={!showLabels ? "Change theme" : undefined} onClick={toggleTheme}><span className="nav-initial" aria-hidden="true">{theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}</span><span>{theme === "dark" ? "Light mode" : "Dark mode"}</span></button>
        <button type="button" className="nav-item" aria-label={guest ? "Return to sign in" : "Sign out"} title={!showLabels ? guest ? "Return to sign in" : "Sign out" : undefined} onClick={signOut}><span className="nav-initial" aria-hidden="true"><LogOut size={18} /></span><span>{guest ? "Return to sign in" : "Sign out"}</span></button>
        </div></details>
      </div>
    </aside>
    <div className="dashboard-main" inert={mobile && menuOpen}>
      <header className="dashboard-top"><div className="reference-top-actions"><button ref={menuButton} className="mobile-navigation-toggle" aria-label="Open navigation" aria-controls="workspace-navigation" aria-expanded={menuOpen} onClick={openMenu}><Menu size={21} /><span>Menu</span></button><strong>{view === "home" ? "Your practice space" : label}</strong></div><span className="top-user">{guest ? "Guest practice" : account}</span></header>
      {offline && <p className="workspace-banner" role="status"><WifiOff size={17} /> Offline. Practice is available on this device. Connected features require internet access.</p>}
      <main className={`dashboard-content ${view === "home" ? "reference-home" : "reference-inner workspace-content"}`} id="workspace-content" ref={content} tabIndex={-1}>{children}</main>
    </div>
    {mobile && <nav className="mobile-quick-nav" aria-label="Quick navigation" inert={menuOpen}>{(["home","setup","study"] as Destination[]).map(id=>{const link=links.find(item=>item.id===id)!;const Icon=link.icon;return <a key={id} href={`/workspace/${id}`} aria-current={current===id?"page":undefined} data-tone={toneFor(id)} onClick={event=>follow(event,id)}><Icon size={22} aria-hidden="true"/><span>{link.label}</span></a>;})}<button aria-label="More navigation" aria-controls="workspace-navigation" aria-expanded={menuOpen} data-active={!["home","setup","study"].includes(current)} onClick={openMenu}><Menu size={22} aria-hidden="true"/><span>More</span></button></nav>}
  </div>;
}
