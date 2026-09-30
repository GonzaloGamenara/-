"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { AuthGate } from "./AuthGate";
import { LaunchProvider } from "./LaunchGate";
import { Shell } from "./Shell";

export function Providers({ children }: { children: ReactNode }) {
  const path = usePathname();
  useEffect(() => {
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);

  // Links públicos de cuentas compartidas: sin login ni navegación de la app
  if (path?.startsWith("/c/")) return <>{children}</>;

  return (
    <LaunchProvider>
      <AuthGate>
        <Shell>{children}</Shell>
      </AuthGate>
    </LaunchProvider>
  );
}
