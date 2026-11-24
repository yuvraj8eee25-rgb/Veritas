import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import Script from "next/script";
import "@fontsource-variable/inter";
import "../styles.css";
import "../workspace.css";
import "../mockup-ui.css";

export const metadata: Metadata = {
  title: "Veritas",
  description: "Practice clear arguments, debate ideas, and check evidence with Veritas.",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = { themeColor: "#FAF7F0", viewportFit: "cover" };

const restoreTheme = `try { document.documentElement.dataset.veritasTheme = localStorage.getItem("veritas-theme") === "dark" ? "dark" : "light"; } catch { document.documentElement.dataset.veritasTheme = "light"; }`;

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <html lang="en" suppressHydrationWarning><body><Script id="restore-veritas-theme" strategy="beforeInteractive">{restoreTheme}</Script>{children}</body></html>;
}
