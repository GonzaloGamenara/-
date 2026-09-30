"use client";

import { useEffect, type ReactNode } from "react";
import { AuthGate } from "./AuthGate";
import { LaunchGate } from "./LaunchGate";
import { Shell } from "./Shell";

export function Providers({ children }: { children: ReactNode }) {
  useEffect(() => {
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);

  return (
    <LaunchGate>
      <AuthGate>
        <Shell>{children}</Shell>
      </AuthGate>
    </LaunchGate>
  );
}
