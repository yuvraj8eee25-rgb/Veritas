import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "../styles.css";
import "../workspace.css";

export const metadata: Metadata = {
  title: "Veritas",
  description: "Practice clear arguments, debate ideas, and check evidence with Veritas.",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = { themeColor: "#08111f", viewportFit: "cover" };

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
