import { useEffect, useState } from "react";

export type VeritasTheme = "light" | "dark";

const storageKey = "veritas-theme";

export function useVeritasTheme() {
  const [theme, setTheme] = useState<VeritasTheme>("light");

  useEffect(() => {
    let saved: string | null = null;
    try { saved = localStorage.getItem(storageKey); } catch { /* Storage can be unavailable. */ }
    const next: VeritasTheme = saved === "dark" ? "dark" : "light";
    document.documentElement.dataset.veritasTheme = next;
    setTheme(next);
  }, []);

  const toggleTheme = () => {
    const next: VeritasTheme = theme === "dark" ? "light" : "dark";
    try { localStorage.setItem(storageKey, next); } catch { /* Keep the current page usable. */ }
    document.documentElement.dataset.veritasTheme = next;
    setTheme(next);
  };

  return { theme, toggleTheme };
}
