"use client";

import { useEffect } from "react";
import dynamic from "next/dynamic";

const VeritasApp = dynamic(() => import("../App"), {
  ssr: false,
  loading: () => <main className="next-loading" aria-live="polite">Loading Veritas...</main>,
});

export default function ClientApp() {
  useEffect(() => {
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js", { scope: "/" });
    }
  }, []);

  return <VeritasApp />;
}
