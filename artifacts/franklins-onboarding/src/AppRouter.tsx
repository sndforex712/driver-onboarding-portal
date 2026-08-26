import React, { useEffect, useState } from 'react';
import DemoLogin from '@/pages/demo-login';
import EmptyPortal from '@/pages/empty-portal';

export default function AppRouter() {
  const [authState, setAuthState] = useState<"checking" | "authenticated" | "anonymous">("checking");

  useEffect(() => {
    let active = true;
    fetch("/api/auth/me", { credentials: "same-origin", headers: { accept: "application/json" } })
      .then((response) => {
        if (!active) return;
        setAuthState(response.ok ? "authenticated" : "anonymous");
      })
      .catch(() => { if (active) setAuthState("anonymous"); });
    return () => { active = false; };
  }, []);

  if (authState === "checking") {
    return <div className="min-h-screen flex flex-col items-center justify-center gap-3 text-primary"><span className="h-9 w-9 animate-spin rounded-full border-2 border-primary/20 border-t-primary" /><span className="text-sm font-semibold">Verifying your DEV/DEMO session…</span></div>;
  }
  if (authState === "anonymous") {
    return <DemoLogin onAuthenticated={() => setAuthState("authenticated")} />;
  }
  return <EmptyPortal onSignedOut={() => setAuthState("anonymous")} />;
}
