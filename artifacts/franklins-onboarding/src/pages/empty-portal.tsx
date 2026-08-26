import React, { useState } from "react";
import { Button, Card, CardContent } from "@/components/ui";

export default function EmptyPortal({ onSignedOut }: { onSignedOut: () => void }) {
  const [isSigningOut, setIsSigningOut] = useState(false);

  const signOut = async () => {
    setIsSigningOut(true);
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "same-origin",
      });
      onSignedOut();
    } finally {
      setIsSigningOut(false);
    }
  };

  return (
    <main className="min-h-screen bg-background px-4 py-6 text-foreground sm:px-6">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-5xl flex-col">
        <header className="flex items-center justify-between border-b border-border pb-5">
          <div className="flex items-center gap-2 text-base font-extrabold text-primary">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-sm text-primary-foreground shadow-sm">F</span>
            <span>Franklins<span className="text-amber-600">.</span>OS</span>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={isSigningOut}
            onClick={() => void signOut()}
          >
            {isSigningOut ? "Signing out…" : "Sign out"}
          </Button>
        </header>

        <section className="flex flex-1 items-center justify-center py-12">
          <Card className="w-full max-w-2xl border-border shadow-[0_8px_30px_rgba(25,47,34,0.07)]">
            <CardContent className="p-7 sm:p-10">
              <div className="fleet-eyebrow">Driver onboarding</div>
              <h1 className="fleet-page-title mt-2">Your onboarding workspace is ready.</h1>
              <p className="mt-4 max-w-xl text-sm leading-6 text-muted-foreground">
                This is a clean starting point. Onboarding screens and workflow views are intentionally not enabled yet.
              </p>
              <div className="mt-8 rounded-xl border border-dashed border-primary/30 bg-primary/[0.03] p-6">
                <div className="text-sm font-semibold text-foreground">Nothing here yet</div>
                <div className="mt-1 text-xs leading-5 text-muted-foreground">
                  New onboarding tools and pages will be added here as the portal is rebuilt.
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        <footer className="border-t border-border pt-4 text-center text-[11px] text-muted-foreground">
          DEV / DEMO — No real data. Not connected to production.
        </footer>
      </div>
    </main>
  );
}